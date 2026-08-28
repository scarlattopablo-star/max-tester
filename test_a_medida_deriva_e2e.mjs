// CUBREASIENTO QUE NO ESTÁ EN EL CATÁLOGO → VA DERECHO A UN ASESOR (28 ago 2026)
//
// Pedido de Pablo: "cuando Max no encuentre el material que piden, que lo envíe a un
// asesor". No es "¿querés que te pase?" y esperar el sí: se lo dice y lo pasa. El
// cliente que no contesta esa pregunta se pierde solo, y el equipo igual ya estaba
// recibiendo el aviso — o sea que le preguntábamos algo que ya estaba decidido.
//
// Corre con: node test_a_medida_deriva_e2e.mjs   (llama a la IA)
import { responder } from "./src/cerebro.js";
import { listarDerivaciones } from "./src/derivaciones.js";

// La PREGUNTA de ofrecimiento (la misma que mira el guard de armarRespuesta).
const OFRECE = /[¿?][^?]*\b(quer[eé]s|quiere|te parece|quer[ií]a)\b[^?]*\b(pas[eoa]r?|pase|paso|derive|derivar|consulta|asesor|compa[ñn]ero|vendedor)\b[^?]*\?/i;
const STOCK = /(agotad|sin stock|no tenemos stock|reingres|repon|no hay stock)/i;
const AVISO = /(avis\w*|te escribo)[^.?!]{0,60}(lleg|entr|repon|stock|dispon)/i;
// Palabras de adentro: al cliente no le dicen nada y le suenan a excusa de robot.
const JERGA = /(cargad[oa]|public\w*|figura|cat[aá]logo|en (el|mi|nuestro) sistema|base de datos)/i;
// Y tiene que CONTESTAR lo que preguntó: que se hace a medida. Un "ya quedó
// registrado, te contacta un asesor" a secas deja al cliente sin respuesta.
const A_MEDIDA = /(a medida|confeccion|se (lo )?hac|fabric)/i;

let ok = 0, mal = 0;
async function caso(nombre, texto) {
  const antes = listarDerivaciones().length;
  const r = await responder(texto, [{ role: "assistant", content: "Buenas tardes, te habla Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }], [], { canal: "test", chatId: "test-medida-" + Math.random() });
  const resp = r.texto || "";
  const derivo = listarDerivaciones().length > antes;
  const pregunto = OFRECE.test(resp);
  const hablóDeStock = STOCK.test(resp) || AVISO.test(resp);
  const jerga = JERGA.test(resp);
  const dijoAMedida = A_MEDIDA.test(resp);
  console.log(`\n--- ${nombre} ---\nCliente: ${texto}\nMax: ${resp.slice(0, 400)}`);
  const pasa = derivo && !pregunto && !hablóDeStock && !jerga && dijoAMedida;
  console.log(pasa ? "✅ le dice que se hace a medida y lo pasa con un asesor, sin preguntar" : `❌ derivó=${derivo} preguntóEnVezDePasarlo=${pregunto} hablóDeStock=${hablóDeStock} jerga=${jerga} dijoAMedida=${dijoAMedida}`);
  pasa ? ok++ : mal++;
}

await caso("Fiat Palio (no está en el catálogo)", "Cuánto me sale cubre asientos para Fiat palio? Ustedes lo instalan?");
await caso("Suzuki S-Presso capitoneado rojo", "Hola, quiero los cubreasientos capitoneados en rojo para un Suzuki S-Presso 2021");
await caso("Citroën AX del 97", "Buenas, tenes cubreasientos para un Citroen AX del 97?");

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
