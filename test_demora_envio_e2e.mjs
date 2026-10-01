// Prueba de CONVERSACIÓN REAL (llama a la IA): pedido de Pablo (1 oct 2026).
// Toda compra o CONSULTA con envío tiene una demora de entrega de 4 a 5 días
// hábiles, y Max tiene que decirlo apenas se habla de envío (no solo al cerrar).
// Corre con: node test_demora_envio_e2e.mjs   (necesita la API key en .env)
process.env.CATALOGO_SIN_DISCO = "1";
import { actualizarCatalogo } from "./src/catalogo_vivo.js";
import { responder } from "./src/cerebro.js";

actualizarCatalogo([
  { id: "MLU222", n: "Alfombra Volkswagen Nivus Bandeja 3d Negro", p: 3000, img: "https://http2.mlstatic.com/D_2-O.jpg" },
], "test");

const saludo = [{ role: "assistant", content: "Buenas tardes, ¿cómo estás? Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }];
const PLAZO = /4 a 5 d[ií]as h[aá]biles/i;
let ok = 0, mal = 0;

async function caso(nombre, texto, debe, historial = saludo) {
  const r = await responder(texto, historial, [], { canal: "test", chatId: "test-envio-" + Math.random() });
  const resp = r.texto || "";
  const pasa = debe ? PLAZO.test(resp) : !PLAZO.test(resp);
  console.log(`\n--- ${nombre} ---\nCliente: ${texto}\nMax: ${resp.slice(0, 600)}\n${pasa ? "✅" : "❌"} ${debe ? "dice" : "NO dice"} la demora`);
  pasa ? ok++ : mal++;
}

await caso("consulta de envío", "hacen envíos a Salto? cuanto demora?", true);
await caso("cuándo llega", "si lo compro hoy cuando me llega a Paysandú?", true);
await caso("quiere con envío", "quiero la alfombra del nivus, mandamela a Rivera", true);
await caso("retiro: no aplica", "tienen alfombra para nivus? la paso a buscar al local", false);

console.log(`\n${ok} OK, ${mal} mal`);
process.exit(mal ? 1 : 0);
