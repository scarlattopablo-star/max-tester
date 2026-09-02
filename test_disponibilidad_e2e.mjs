// Prueba de CONVERSACIÓN REAL (llama a la IA) de la DISPONIBILIDAD A PEDIDO.
// Pedido de Pablo (2 sep 2026): activó en Mercado Libre artículos que se venden
// pero están disponibles recién a los 21 días, y Max los cotizaba como si
// estuvieran en el local.
//
// Qué se verifica, con el cliente preguntando como pregunta de verdad:
//   · producto A PEDIDO  -> Max dice que se entrega a los 21 días. NO dice que
//                           está agotado y NO ofrece "te aviso cuando llegue".
//   · producto del LOCAL -> no aparece ningún plazo (nada de ruido de más).
//   · el cliente compra  -> el plazo vuelve a salir al cerrar la venta.
//
// Corre con: node test_disponibilidad_e2e.mjs   (necesita la API key en .env)
// La versión sin red ni IA es: node src/disponibilidad.test.mjs
process.env.CATALOGO_SIN_DISCO = "1";
import { actualizarCatalogo } from "./src/catalogo_vivo.js";
import { responder } from "./src/cerebro.js";

// Catálogo de prueba: el cubreasiento de la Hilux es a pedido (21 días), la
// alfombra del Nivus se lleva en el momento.
actualizarCatalogo([
  { id: "MLU111", n: "Cubreasiento Toyota Hilux Cuero Ecologico Negro", p: 18000, img: "https://http2.mlstatic.com/D_1-O.jpg", d: 21 },
  { id: "MLU222", n: "Alfombra Volkswagen Nivus Bandeja 3d Negro", p: 3000, img: "https://http2.mlstatic.com/D_2-O.jpg" },
], "test");

let ok = 0, mal = 0;
const saludo = [{ role: "assistant", content: "Buenas tardes, ¿cómo estás? Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }];

async function caso(nombre, texto, revisar, historial = saludo) {
  const r = await responder(texto, historial, [], { canal: "test", chatId: "test-disp-" + Math.random() });
  const resp = r.texto || "";
  const captions = (r.imagenesEnviar || []).map((f) => f.caption || "").join(" | ");
  console.log(`\n--- ${nombre} ---`);
  console.log("Cliente:", texto);
  console.log("Max:", resp.slice(0, 700));
  if (captions) console.log("Fotos:", captions.slice(0, 300));
  const { pasa, detalle } = revisar({ resp, captions });
  console.log(pasa ? `✅ ${detalle}` : `❌ ${detalle}`);
  pasa ? ok++ : mal++;
  return r;
}

const PLAZO = /21\s*d[ií]as/i;
const AGOTADO = /(agotad|sin stock|no tenemos stock|reingres|te aviso apenas|avisar cuando)/i;

await caso(
  "producto A PEDIDO — avisa los 21 días",
  "hola, cuánto sale el cubreasiento para mi Toyota Hilux?",
  ({ resp, captions }) => {
    const dice = PLAZO.test(resp) || PLAZO.test(captions);
    if (!dice) return { pasa: false, detalle: "No le avisó que se entrega a los 21 días" };
    if (AGOTADO.test(resp)) return { pasa: false, detalle: "Lo trató como AGOTADO (se puede comprar hoy, con demora)" };
    return { pasa: true, detalle: "Avisó el plazo sin decir que estaba agotado" };
  }
);

await caso(
  "producto del LOCAL — sin plazos inventados",
  "hola, precio de la alfombra para el VW Nivus?",
  ({ resp, captions }) => {
    const inventa = /\b\d+\s*d[ií]as\b/i.test(resp.replace(/2 o 3 d[ií]as/gi, "")) || PLAZO.test(captions);
    return inventa
      ? { pasa: false, detalle: "Metió un plazo que ese artículo no tiene" }
      : { pasa: true, detalle: "Cotizó sin hablar de demoras" };
  }
);

await caso(
  "cierre de la venta — el plazo vuelve a aparecer",
  "dale, lo quiero. Soy Juan, 099111222, paso a retirarlo por el local",
  ({ resp }) => (PLAZO.test(resp)
    ? { pasa: true, detalle: "Al cerrar la venta le recordó los 21 días" }
    : { pasa: false, detalle: "Cerró la venta sin recordarle el plazo" }),
  [
    ...saludo,
    { role: "user", content: "cuánto sale el cubreasiento para mi Toyota Hilux?" },
    { role: "assistant", content: "El cubreasiento en cuero ecológico para tu Hilux sale $ 18.000, sin colocación. Se hace a pedido: está disponible a los 21 días de la compra." },
  ]
);

console.log(`\n${mal ? "❌" : "✅"} ${ok} OK, ${mal} fallaron`);
process.exit(mal ? 1 : 0);
