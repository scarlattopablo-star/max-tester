// Prueba las dos reglas pedidas por Pablo el 30 jul 2026:
//  1) Max habla SOLO del modelo que le nombró el cliente (no compara modelos:
//     le dijo a un cliente que la alfombra de la Toro era igual a la de la Strada).
//  2) Alfombras / cubrevolantes / accesorios NO llevan colocación: se retiran
//     cuando el cliente quiera, SIN turno ni agenda.
import { responder } from "./src/cerebro.js";

let ok = 0, mal = 0;

const saludo = [{ role: "assistant", content: "Buenas tardes, ¿cómo estás? Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }];

async function caso(nombre, historial, texto, revisar) {
  const r = await responder(texto, historial, [], { canal: "test", chatId: "test-mr-" + Math.random() });
  const resp = r.texto || "";
  const captions = (r.imagenesEnviar || []).map((f) => f.caption || "").join(" | ");
  const herramientas = (r.acciones || []).map((a) => a.herramienta);
  console.log(`\n--- ${nombre} ---`);
  console.log("Max:", resp.slice(0, 400));
  if (captions) console.log("Fotos:", captions.slice(0, 200));
  if (herramientas.length) console.log("Tools:", herramientas.join(", "));
  const { pasa, detalle } = revisar({ resp, captions, herramientas });
  console.log(pasa ? `✅ ${detalle}` : `❌ ${detalle}`);
  pasa ? ok++ : mal++;
}

// ── 1) NO COMPARAR MODELOS ─────────────────────────────────────────────
// Solo miramos el TEXTO de Max: los pies de foto traen nombres del catálogo
// y ahí es legítimo que aparezca cualquier modelo.
const otroModelo = /strada|saveiro|hilux|ranger|amarok|s10|frontier|montana|oroch/i;
const comparacion = /(igual|mism[ao]|sirve la de|comparte|tambi[eé]n le va|le calza la de|equivale)/i;

await caso(
  "Alfombra Fiat Toro (el caso que falló)",
  saludo,
  "Hola, tenés alfombras para la Fiat Toro?",
  ({ resp }) => {
    const nombraOtro = otroModelo.test(resp);
    const compara = comparacion.test(resp) && nombraOtro;
    return {
      pasa: !nombraOtro && !compara,
      detalle: nombraOtro ? `nombró OTRO modelo en el texto: "${resp.match(otroModelo)[0]}"` : "habló solo de la Toro",
    };
  }
);

await caso(
  "Cubreasiento Fiat Toro",
  saludo,
  "Buenas, precio de cubreasientos para una Toro 2021",
  ({ resp }) => {
    const nombraOtro = otroModelo.test(resp);
    return {
      pasa: !nombraOtro,
      detalle: nombraOtro ? `nombró OTRO modelo: "${resp.match(otroModelo)[0]}"` : "habló solo de la Toro",
    };
  }
);

await caso(
  "Fiat Freedom (excepción: es la Strada, pero no se lo dice)",
  saludo,
  "Tenés alfombras para la Fiat Freedom?",
  ({ resp }) => {
    const niega = /(no ten|no hay|no contamos|no manejamos|no disponemos|no (la|lo|las|los)? ?trabajamos|no estamos trabajando)/i.test(resp);
    // Desde el 3 ago el texto oficial de AGOTADO dice "no tenemos en stock" y termina
    // ofreciendo el aviso. Eso NO es negarle el producto al cliente: es la respuesta
    // correcta para algo pausado. Solo cuenta como negación si NO ofrece el aviso.
    const ofreceAviso = /(avis\w*|te escribo)[^.?!]{0,60}(lleg|entr|repon|stock|dispon)/i.test(resp);
    const nombraStrada = /strada/i.test(resp);
    const niegaDeVerdad = niega && !ofreceAviso;
    return {
      pasa: !niegaDeVerdad && !nombraStrada,
      detalle: niegaDeVerdad ? "dijo que NO hay para Freedom sin ofrecerle el aviso" : nombraStrada ? "le nombró la Strada al cliente" : "no le cerró la puerta y no le nombró la Strada",
    };
  }
);
// ⚠️ 2 ago 2026 — este caso protege la familia Strada/Freedom/Volcano de la regla nueva
// ("si no está publicado en ML, no lo trabajamos"). El dueño confirmó que esa familia SÍ se
// trabaja, así que es una de las tres excepciones del CASO 2 en cerebro.js: para esos autos
// Max ofrece y deriva, nunca niega. Si este caso se cae, revisá esas excepciones antes de
// tocar el test.

// ── 2) RETIRO SIN TURNO ────────────────────────────────────────────────
const pidioTurno = (h) => h.includes("solicitar_turno");
const habloDeAgenda = /(confirma|coordina|sujet[ao] a disponibilidad|te avisa|agenda|turno)/i;

await caso(
  "Retiro de alfombra: sin turno",
  [
    ...saludo,
    { role: "user", content: "Quiero la alfombra de piso para mi Onix" },
    { role: "assistant", content: "Perfecto, te la reservo. Sale $2.490." },
  ],
  "Dale, la llevo. ¿Cuándo puedo pasar a buscarla?",
  ({ resp, herramientas }) => {
    const turno = pidioTurno(herramientas);
    const invita = /(cuando quieras|cuando gustes|cuando te quede c[oó]modo|no hace falta|no necesit)/i.test(resp);
    return {
      pasa: !turno && invita,
      detalle: turno ? "llamó a solicitar_turno (no corresponde)" : invita ? "lo invitó a pasar cuando quiera, sin turno" : `no invitó claramente a pasar libremente${habloDeAgenda.test(resp) ? " y habló de agenda/confirmación" : ""}`,
    };
  }
);

await caso(
  "Retiro de cubrevolante: sin turno",
  // El producto ya se mostró y se eligió: si no, Max prioriza (bien) mostrarlo
  // primero y la pregunta del retiro le queda para el mensaje siguiente.
  [
    ...saludo,
    { role: "user", content: "Quiero un cubrevolante para mi Hyundai" },
    { role: "assistant", content: "Te mandé la foto: Cubrevolante Hyundai cuero/carbono premium negro, sale $1.311." },
    { role: "user", content: "Ese me sirve, lo llevo." },
    { role: "assistant", content: "Buenísimo, queda anotado." },
  ],
  "¿Tengo que agendar para pasar a retirarlo?",
  ({ resp, herramientas }) => {
    const turno = pidioTurno(herramientas);
    const invita = /(no hace falta|no necesit|no es necesario|cuando quieras|cuando gustes|sin agendar|sin turno)/i.test(resp);
    return {
      pasa: !turno && invita,
      detalle: turno ? "llamó a solicitar_turno (no corresponde)" : invita ? "le aclaró que no necesita agendar" : "no dejó claro que puede pasar sin agendar",
    };
  }
);

await caso(
  "Colocación de capitoneado: SÍ va el turno (no romper lo que andaba)",
  [
    ...saludo,
    { role: "user", content: "Quiero cubreasientos capitoneados negros para mi Hilux 2022" },
    { role: "assistant", content: "Excelente elección. El capitoneado es nuestra línea premium." },
  ],
  "Los quiero con colocación, ¿cuándo puedo ir?",
  ({ resp, herramientas }) => {
    const turno = pidioTurno(herramientas) || herramientas.includes("derivar_a_humano");
    const noPrometeFecha = !/te espero el|and[aá] cuando quieras|ven[íi] cuando quieras|pas[aá] cuando quieras/i.test(resp);
    return {
      pasa: turno && noPrometeFecha,
      detalle: !turno ? "NO derivó ni pidió turno para la colocación" : !noPrometeFecha ? "le dijo que pase cuando quiera (mal: la colocación necesita fecha confirmada)" : "derivó al equipo y no prometió fecha",
    };
  }
);

console.log(`\n${"=".repeat(60)}\nRESULTADO: ${ok} OK, ${mal} fallidos`);
process.exit(mal ? 1 : 0);
