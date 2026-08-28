// Conversación REAL (llama a la IA) de los dos casos del 28 ago 2026 en los que Max
// dijo "agotado" del CAPITONEADO y tuvo que salir el equipo a desmentirlo.
// Corre con: node test_capitoneado_no_agotado_e2e.mjs
import { responder } from "./src/cerebro.js";

const AGOTADO = /(agotad|sin stock|no tenemos stock|reingres|repon|no hay stock)/i;
const AVISO = /(avis\w*|te escribo)[^.?!]{0,60}(lleg|entr|repon|stock|dispon)/i;
const JERGA = /(public\w*|figura|cat[aá]logo|en (el|nuestro) sistema|base de datos)/i;

let ok = 0, mal = 0;
async function caso(nombre, mensajes) {
  let historial = [{ role: "assistant", content: "Buenas tardes, te habla Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }];
  let resp = "";
  const chatId = "test-capit-" + Math.random();
  console.log(`\n--- ${nombre} ---`);
  for (const m of mensajes) {
    const r = await responder(m, historial, [], { canal: "test", chatId });
    resp = r.texto || "";
    console.log("Cliente:", m);
    console.log("Max:", resp.slice(0, 400));
    historial = [...historial, { role: "user", content: m }, { role: "assistant", content: resp }];
  }
  const dijoAgotado = AGOTADO.test(resp);
  const prometioAviso = AVISO.test(resp);
  const jerga = JERGA.test(resp);
  const pasa = !dijoAgotado && !prometioAviso && !jerga;
  console.log(pasa ? "✅ no habla de stock ni promete avisos" : `❌ agotado=${dijoAgotado} prometióAviso=${prometioAviso} jerga=${jerga}`);
  pasa ? ok++ : mal++;
}

await caso("Fiat Palio — capitoneado negro (el cliente cita la foto)", [
  "Cuánto me sale cubre asientos para Fiat palio? Ustedes lo instalan?",
]);

await caso("Fiat Palio — eligiendo el color por la foto citada", [
  "Hola, quiero cubreasientos para mi Fiat Palio",
  "[Contexto interno — el cliente respondió CITANDO esta foto que le mandaste: \"Capitoneado premium - Negro\". Es ESA la que eligió: no le preguntes de nuevo cuál era.] Buenos días, de este color tenes modelo para Fiat palio o es universal?",
]);

await caso("Suzuki S-Presso — capitoneado rojo (la publicación está mal cargada en ML)", [
  "Hola buenos días, quiero consultar cuanto saldría mandar a hacer los cubre asientos para un Suzuki S-Presso del 2021",
]);

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
