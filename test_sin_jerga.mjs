// Pedido de Pablo del 2 ago 2026 (noche), mirando una charla real:
//  1) Max hablaba como sistema ("no tengo alfombras publicadas", "no figura en el
//     catálogo"). Al cliente eso no le dice nada: tiene que decir que está agotado.
//  2) Max derivaba al asesor por reflejo. Solo se deriva si el cliente muestra
//     interés (insiste, pide que le avisen, quiere encargarlo) o si hace falta.
//  3) Lo PAUSADO en ML no cambia: "ahora no hay, está por llegar, ¿te aviso?".
// Corre con: node test_sin_jerga.mjs   (usa la IA real y el catálogo real)
import { responder } from "./src/cerebro.js";

let ok = 0, mal = 0;
const saludo = [{ role: "assistant", content: "Buenas tardes, ¿cómo estás? Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }];

async function caso(nombre, texto, revisar, historial = saludo) {
  const r = await responder(texto, historial, [], { canal: "test", chatId: "test-jerga-" + Math.random() });
  const resp = r.texto || "";
  // Ojo: una derivación BLOQUEADA por el guard igual aparece en `acciones`. Lo que
  // importa es si se registró de verdad (resultado.ok !== false).
  const herramientas = (r.acciones || []).filter((a) => a.resultado?.ok !== false).map((a) => a.herramienta);
  console.log(`\n--- ${nombre} ---`);
  console.log("Cliente:", texto);
  console.log("Max:", resp.slice(0, 400));
  if (herramientas.length) console.log("Tools:", herramientas.join(", "));
  const { pasa, detalle } = revisar({ resp, herramientas });
  console.log(pasa ? `✅ ${detalle}` : `❌ ${detalle}`);
  pasa ? ok++ : mal++;
  return resp;
}

const JERGA = /(public\w*|figura|catálogo|catalogo|en (el|nuestro) sistema|en la lista|base de datos)/i;
const AGOTADO = /(agot|sin stock|no ten\w*[^.?!]{0,40}(por ahora|por el momento|en este momento|ahora mismo)|no hay[^.?!]{0,40}(por ahora|por el momento|en este momento)|no (nos )?qued)/i;

// 1) Producto que NO existe: sin jerga, sin derivar, hablando de stock, y SIN
// cambiarle el tema a otro producto que el cliente no pidió.
await caso("JMC EV4 (no existe): sin jerga, sin derivar, sin cambiar de producto", "Tenes alfombra para jmc ev4", ({ resp, herramientas }) => {
  const jerga = JERGA.test(resp);
  const derivo = herramientas.includes("derivar_a_humano");
  const hablaDeStock = AGOTADO.test(resp);
  const cambiaTema = /cubreasiento|funda|cubre ?volante|cubre ?auto/i.test(resp);
  const pasa = !jerga && !derivo && hablaDeStock && !cambiaTema;
  return { pasa, detalle: pasa ? "habla de alfombras y de stock, sin jerga, sin derivar y sin cambiar de producto" : `jerga=${jerga} derivó=${derivo} hablaDeStock=${hablaDeStock} cambióDeProducto=${cambiaTema}` };
});

// 2) Si el cliente muestra interés, Max OFRECE el asesor — no deriva por su cuenta.
const conInteres = [...saludo,
  { role: "user", content: "Tenes alfombra para jmc ev4" },
  { role: "assistant", content: "De alfombras para la JMC EV4 estamos sin stock por ahora." }];
await caso(
  "JMC EV4 + interés: OFRECE el asesor, no deriva solo",
  "me interesa igual, la necesito, se puede encargar?",
  ({ resp, herramientas }) => {
    const derivo = herramientas.includes("derivar_a_humano");
    const ofrece = /(quer[eé]s que|te parece si|si quer[eé]s)[^.?!]{0,80}(asesor|compañero|vendedor|equipo)/i.test(resp);
    const pasa = ofrece && !derivo;
    return { pasa, detalle: pasa ? "ofreció pasarlo con un asesor sin derivar todavía" : `ofreció=${ofrece} derivóSolo=${derivo}` };
  },
  conInteres
);

// 3) Recién cuando el cliente ACEPTA, ahí sí deriva.
await caso(
  "El cliente acepta el asesor: ahí sí deriva",
  "si dale, pasame con un asesor",
  ({ herramientas }) => {
    const derivo = herramientas.includes("derivar_a_humano");
    return { pasa: derivo, detalle: derivo ? "derivó recién cuando el cliente aceptó" : "NO derivó aunque el cliente aceptó" };
  },
  [...conInteres,
   { role: "user", content: "me interesa igual, la necesito, se puede encargar?" },
   { role: "assistant", content: "¿Querés que le pase tu consulta a un asesor para que lo vea?" }]
);

// 3) Lo PAUSADO no cambia: agotado + ofrece avisar, sin jerga.
await caso("JMC EV3 (pausada): ofrece avisar", "Tenes alfombra para jmc ev3", ({ resp, herramientas }) => {
  const jerga = JERGA.test(resp);
  const ofrece = /(avis\w*|te escribo)[^.?!]{0,60}(lleg|entr|repon|stock|dispon)/i.test(resp);
  const derivo = herramientas.includes("derivar_a_humano");
  const pasa = ofrece && !jerga && !derivo;
  return { pasa, detalle: pasa ? "ofrece avisar cuando llegue, sin jerga ni derivación" : `ofreceAviso=${ofrece} jerga=${jerga} derivó=${derivo}` };
});

// 4) Caso real del screenshot: "alfombra para nammi" tiene que VENDERSE de una,
// sin preguntarle al cliente si Nammi es la marca o el modelo.
await caso("Nammi: vende sin repreguntar la marca", "Hola tenes alfombra para nammi", ({ resp, herramientas }) => {
  const repregunta = /(qu[eé] marca|de qu[eé] marca|marca es|es la marca|marca del|es un modelo|qu[eé] veh[ií]culo es)/i.test(resp);
  const buscó = herramientas.some((h) => h === "enviar_foto" || h === "consultar_precio");
  const pasa = !repregunta && buscó;
  return { pasa, detalle: pasa ? "buscó y ofreció sin repreguntar la marca" : `repreguntóMarca=${repregunta} buscó=${buscó}` };
});

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
