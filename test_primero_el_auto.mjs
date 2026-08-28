// PRIMERO EL AUTO, DESPUÉS LOS MATERIALES (pedido de Pablo, 28 ago 2026:
// "si el modelo no está que derive a asesor — antes de hablar de materiales").
//
// Enumerarle las 4 líneas a alguien de quien todavía no sabemos el auto es empezar la
// venta al revés: si después resulta que de ese vehículo no tenemos nada, ya le
// prometimos un material y hay que dar marcha atrás. Es lo que pasó el 28 ago con el
// cliente del Fiat Palio: Max le ofreció "contarle sobre el resto de la línea
// (capitoneado, tela, cuero Sport)" para un auto del que no tenemos NADA cargado.
//
// Corre con: node test_primero_el_auto.mjs   (llama a la IA)
import { responder } from "./src/cerebro.js";
import { listarDerivaciones } from "./src/derivaciones.js";

// Los MATERIALES / líneas. Ojo: "a medida" no es un material, y "cubreasiento" tampoco.
const MATERIALES = /capiton|eco ?cuero|cuero ecol|tapiceri|cuero sport|neopren|costura|espuma|\d+\s?mm|\btelas?\b/i;
const PIDE_AUTO = /(qu[eé]|cu[aá]l).{0,40}(auto|veh[ií]culo|marca|modelo)|marca y modelo|para qu[eé] (auto|veh[ií]culo)/i;

let ok = 0, mal = 0;
async function caso(nombre, msgs, { materiales, pideAuto = null, deriva = null }) {
  let hist = [{ role: "assistant", content: "Buenas tardes, te habla Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }];
  let resp = "", fotos = 0;
  const antes = listarDerivaciones().length;
  for (const m of msgs) {
    const r = await responder(m, hist, [], { canal: "test", chatId: "auto1ro-" + Math.random() });
    resp = r.texto || ""; fotos = (r.imagenesEnviar || []).length;
    hist = [...hist, { role: "user", content: m }, { role: "assistant", content: resp }];
  }
  const hablo = MATERIALES.test(resp) || fotos > 0;
  const derivo = listarDerivaciones().length > antes;
  const fallos = [];
  if (hablo !== materiales) fallos.push(`materiales=${hablo} (esperado ${materiales})`);
  if (pideAuto !== null && PIDE_AUTO.test(resp) !== pideAuto) fallos.push(`pideElAuto=${PIDE_AUTO.test(resp)} (esperado ${pideAuto})`);
  if (deriva !== null && derivo !== deriva) fallos.push(`derivó=${derivo} (esperado ${deriva})`);
  console.log(`\n${fallos.length ? "❌" : "✅"} ${nombre}\n   Cliente: ${msgs[msgs.length - 1].slice(0, 90)}\n   Max: ${resp.slice(0, 300)}${fotos ? `\n   (+${fotos} fotos)` : ""}`);
  if (fallos.length) console.log("   →", fallos.join(" · "));
  fallos.length ? mal++ : ok++;
}

console.log("\n── TODAVÍA NO SABEMOS EL AUTO: no se habla de materiales, se pregunta ──");
await caso("pregunta por los materiales sin decir el auto", ["Hola! qué materiales tienen para cubreasientos?"], { materiales: false, pideAuto: true });
await caso("insiste en saber los tipos antes de decir el auto", ["Hola, quiero cubreasientos", "contame qué tipos hay antes de decirte el auto"], { materiales: false, pideAuto: true });

console.log("\n── EL AUTO NO ESTÁ EN EL CATÁLOGO: asesor, y tampoco materiales ──");
await caso("Fiat Palio", ["Hola, quiero cubreasientos para mi Fiat Palio", "y qué materiales manejan?"], { materiales: false, deriva: true });
await caso("Citroën AX del 97", ["Buenas, para un Citroen AX del 97 qué materiales manejan para cubreasientos?"], { materiales: false, deriva: true });

console.log("\n── CONTROL: el auto SÍ está → se le presenta todo, como siempre ──");
await caso("Fiat Strada doble cabina", ["Hola, quiero cubreasientos para una Fiat Strada doble cabina"], { materiales: true, deriva: false });
await caso("y sigue hablando de materiales en el turno siguiente", ["Hola, quiero cubreasientos para una Fiat Strada doble cabina", "cuál me recomendás?"], { materiales: true });

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
