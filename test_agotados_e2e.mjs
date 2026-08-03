// Prueba de CONVERSACIÓN REAL (llama a la IA) de la regla del 2 ago 2026:
//   · producto PAUSADO en ML  -> Max dice que se agotó y ofrece avisar. NO deriva.
//   · producto que NO existe   -> Max dice que no trabajamos ese modelo. NO deriva.
//   · producto activo          -> se vende normal, sin hablar de agotados.
// Corre con: node test_agotados_e2e.mjs   (necesita ANTHROPIC_API_KEY en .env)
//
// ⚠️ CATALOGO_SIN_DISCO antes de los imports: si no, el catálogo de prueba pisa el
// snapshot real de src/productos_ml.json.
process.env.CATALOGO_SIN_DISCO = "1";
import { actualizarCatalogo } from "./src/catalogo_vivo.js";
import { responder } from "./src/cerebro.js";

// Catálogo de prueba: la Hilux se vende, la Nivus está pausada en ML.
actualizarCatalogo(
  [{ id: "MLU111", n: "Alfombra Bandeja 3D Toyota Hilux", p: 3500, img: "https://http2.mlstatic.com/D_1-O.jpg" }],
  "test",
  [{ id: "MLU333", n: "Alfombra Bandeja 3D Volkswagen Nivus", img: "https://http2.mlstatic.com/D_2-O.jpg", motivo: "pausada" }]
);

let ok = 0, mal = 0;
const saludo = [{ role: "assistant", content: "Buenas tardes, ¿cómo estás? Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }];

async function caso(nombre, texto, revisar) {
  const r = await responder(texto, saludo, [], { canal: "test", chatId: "test-ago-" + Math.random() });
  const resp = r.texto || "";
  // El precio suele ir en el PIE de la foto, no repetido en el texto (regla vieja
  // de Max: "enviar_foto ya incluye el precio, en el texto no repitas la lista").
  const captions = (r.imagenesEnviar || []).map((f) => f.caption || "").join(" | ");
  // Una derivación BLOQUEADA por el guard (derivar sin haber buscado) igual figura
  // en `acciones`: solo cuentan las que se registraron de verdad.
  const herramientas = (r.acciones || []).filter((a) => a.resultado?.ok !== false).map((a) => a.herramienta);
  console.log(`\n--- ${nombre} ---`);
  console.log("Cliente:", texto);
  console.log("Max:", resp.slice(0, 500));
  if (captions) console.log("Fotos:", captions.slice(0, 200));
  if (herramientas.length) console.log("Tools:", herramientas.join(", "));
  const { pasa, detalle } = revisar({ resp, captions, herramientas });
  console.log(pasa ? `✅ ${detalle}` : `❌ ${detalle}`);
  pasa ? ok++ : mal++;
}

const dice = (t, re) => re.test(t);
const AGOTADO = /(agot|sin stock|no tenemos stock|reposici|esperando|por llegar|nos quedamos sin)/i;
// Ojo: tiene que exigir el aviso POR LA LLEGADA del producto. Un "avisame si
// necesitás otra cosa" no cuenta (y hacía fallar la prueba del modelo que no existe).
const OFRECE_AVISO = /(avis\w*|te escribo)[^.?!]{0,60}(lleg|entr|repon|stock|dispon)/i;
// 2 ago (noche): Pablo pidió que al cliente se le hable de STOCK, no de "no lo
// trabajamos" ni de papeles internos ("no está publicado", "no figura en el catálogo").
const NO_TRABAJAMOS = /(agot|sin stock|no (lo |la |las |los )?(trabajamos|tenemos|manejamos)|no estamos trabajando|no contamos con|no hay)/i;
const JERGA_INTERNA = /(public\w*|figura|cat[aá]logo|en (el|nuestro) sistema|base de datos)/i;

// 1) PAUSADO → agotado + ofrece avisar, sin derivar.
await caso("Alfombra Nivus (pausada en ML)", "hola, tenés alfombra para VW Nivus?", ({ resp, herramientas }) => {
  const derivo = herramientas.includes("derivar_a_humano");
  const pasa = dice(resp, AGOTADO) && dice(resp, OFRECE_AVISO) && !derivo;
  return { pasa, detalle: pasa ? "dice que se agotó y ofrece avisar, sin derivar" : `agotado=${dice(resp, AGOTADO)} ofreceAviso=${dice(resp, OFRECE_AVISO)} derivó=${derivo}` };
});

// 2) INEXISTENTE (alfombra) → no lo trabajamos, sin derivar y sin prometer aviso.
await caso("Alfombra Ferrari Testarossa (no existe)", "tenés alfombra bandeja para una Ferrari Testarossa?", ({ resp, herramientas }) => {
  const derivo = herramientas.includes("derivar_a_humano");
  const prometeAviso = dice(resp, OFRECE_AVISO);
  const jerga = dice(resp, JERGA_INTERNA);
  const pasa = dice(resp, NO_TRABAJAMOS) && !derivo && !prometeAviso && !jerga;
  return { pasa, detalle: pasa ? "le habla de stock, sin jerga, sin derivar y sin prometer aviso" : `dijoQueNoHay=${dice(resp, NO_TRABAJAMOS)} derivó=${derivo} prometióAviso=${prometeAviso} jerga=${jerga}` };
});

// 3) ACTIVO → se vende normal, sin hablar de agotados.
await caso("Alfombra Hilux (activa)", "cuánto sale la alfombra para Hilux?", ({ resp, captions }) => {
  const hayPrecio = /3\.?500/.test(resp + " " + captions);
  const pasa = !dice(resp, AGOTADO) && hayPrecio;
  return { pasa, detalle: pasa ? "ofrece el producto con su precio, sin mencionar agotado" : `mencionóAgotado=${dice(resp, AGOTADO)} hayPrecio=${hayPrecio}` };
});

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
