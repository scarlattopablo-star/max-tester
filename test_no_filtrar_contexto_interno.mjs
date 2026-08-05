// NUNCA le puede llegar al cliente el texto interno del sistema.
//
// Caso real del 5 de agosto de 2026 (captura de Pablo): el cliente preguntó "tenes para
// hb20" y Max le contestó bien —había stock— pero le mandó pegado esto:
//
//   "...Te muestro la opción disponible.[Contexto interno — opciones que le mostré al
//    cliente con foto, numeradas: 1) Alfombra Hb20 Bandeja Rigida Negro - $ 2.850. Si el
//    cliente elige un número ("la 1", "el 2"...), corresponde a ESTA lista; NO vuelvas a
//    mostrar las opciones: avanzá con la que eligió.]"
//
// Ese bloque es una nota que el código deja en la MEMORIA de Max para saber, en el turno
// siguiente, a qué producto se refiere "la 1". El cliente no entiende nada de eso.
//
// Por qué se escapó: el bloque vive en el historial que lee el modelo, y el modelo lo
// COPIÓ en su propia respuesta. Los tres canales mandan el texto limpio, así que no
// alcanzaba con mirar el envío: hay que sacarlo de lo que escribe el modelo.
//
// Corre con: node test_no_filtrar_contexto_interno.mjs   (sin red y sin IA)
process.env.CATALOGO_SIN_DISCO = "1";
import { limpiarJerga } from "./src/cerebro.js";

let pasaron = 0;
const fallos = [];
const ok = (cond, msg) => (cond ? (pasaron++, console.log("✅", msg)) : fallos.push(msg));

const SEP = "⁣"; // el separador invisible que usa el historial

// ── Lo que el modelo llegó a escribir, tal cual salió al cliente ──────────────
const REALES = [
  ["el caso de la captura (HB20)",
    'Buenas noticias también para tu HB20, ya volvió a tener stock. Te muestro la opción disponible.[Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Hb20 Bandeja Rigida Negro - $ 2.850. Si el cliente elige un número ("la 1", "el 2", "quiero la primera"), corresponde a ESTA lista; NO vuelvas a mostrar las opciones: avanzá con la que eligió.]',
    "Buenas noticias también para tu HB20, ya volvió a tener stock. Te muestro la opción disponible."],
  ["con el separador invisible delante",
    `Tenemos 2 opciones para tu Hilux.${SEP}[Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra - $ 100.]`,
    "Tenemos 2 opciones para tu Hilux."],
  ["la nota del video",
    "Te paso el video.[Contexto interno — YA le envié el video de: cuero sport (con su material). Mientras se hable del MISMO auto/pedido, NO repitas ese video.]",
    "Te paso el video."],
  ["la marca del asesor humano",
    `Paso tu consulta a un compañero.${SEP}[respuesta escrita por un ASESOR humano del equipo — no la escribió Max]`,
    "Paso tu consulta a un compañero."],
  ["dos bloques pegados",
    "Listo.[Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) X - $ 1.] [Contexto interno — YA le envié el video de: Y.]",
    "Listo."],
];
console.log("── el texto interno no puede salir al cliente ──");
for (const [etiqueta, sucio, esperado] of REALES) {
  const limpio = limpiarJerga(sucio);
  ok(limpio === esperado, `${etiqueta} → ${JSON.stringify(limpio.slice(0, 80))}`);
}

// ── Nada de esto puede sobrevivir, escrito como sea ───────────────────────────
console.log("\n── ni una palabra de la nota interna queda en pie ──");
for (const [etiqueta, sucio] of [
  ["en minúscula", "Hola.[contexto interno — lo que sea]"],
  ["con dos puntos", "Hola. [Contexto interno: opciones numeradas 1) X]"],
  ["sin cerrar el corchete", "Hola.[Contexto interno — opciones que le mostré al cliente"],
  ["en el medio de la frase", "Hola [Contexto interno — algo] ¿te sirve?"],
]) {
  const limpio = limpiarJerga(sucio);
  ok(!/contexto interno|le mostré al cliente|escribió Max|vuelvas a mostrar/i.test(limpio),
    `${etiqueta} → ${JSON.stringify(limpio)}`);
}

// ── Y no puede romper los mensajes normales ──────────────────────────────────
// Los corchetes se usan de verdad en las charlas: no se puede borrar todo lo que
// esté entre corchetes o se pierden los marcadores de comprobantes y de fotos.
console.log("\n── los mensajes normales quedan intactos ──");
for (const [texto, motivo] of [
  ["Tenemos alfombra bandeja 3D para tu Hilux, sale $3.500.", "una cotización común"],
  ["Te llegó el comprobante [comprobante #304], gracias.", "el marcador de comprobante"],
  ["Justo esa la tenemos agotada, ¿querés que te avise?", "el aviso de agotado"],
  ["El material es cuero ecológico [negro] con costura ocre.", "corchetes de verdad"],
]) {
  ok(limpiarJerga(texto) === texto, `${motivo}: queda igual`);
}

console.log("");
if (fallos.length) {
  console.log(`❌ ${pasaron} pasaron, ${fallos.length} fallaron\n`);
  fallos.forEach((f) => console.log("   ❌", f));
  process.exit(1);
}
console.log(`✅ TODO OK — ${pasaron} pasaron, 0 fallaron`);
