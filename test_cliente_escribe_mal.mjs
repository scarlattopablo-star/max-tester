// EL CLIENTE ESCRIBE MAL. En WhatsApp se tipea rápido y con el teclado del celular:
// "alfonbra", "hylux", "montanna", "chebrolet". Antes cualquiera de esas dejaba la
// búsqueda en CERO —una palabra que no está en ningún título se volvía obligatoria— y
// Max le contestaba que no había. Un solo error de tipeo tumbaba la consulta entera.
//
// La corrección va contra el VOCABULARIO DEL PROPIO CATÁLOGO: una palabra que no existe
// en ningún título se cambia por la más parecida que sí existe, y solo si no hay empate.
// Por eso nunca puede inventar un auto que no vendemos.
//
// Corre con: node test_cliente_escribe_mal.mjs   (sin red y sin IA)
process.env.CATALOGO_SIN_DISCO = "1";
import { buscarPrecio, identificaModelo, textoNormalizado as norm } from "./src/cerebro.js";
import { productos } from "./src/catalogo_vivo.js";

let pasaron = 0;
const fallos = [];
const ok = (cond, msg) => (cond ? (pasaron++, console.log("✅", msg)) : fallos.push(msg));
const activos = productos();
const porId = new Map(activos.map((p) => [p.id, p.n]));
const res = (q) => (buscarPrecio(q) || []).map((p) => porId.get(p.id) || p.id);

// ── 1. Escrito mal tiene que dar LO MISMO que escrito bien ────────────────────
console.log("\n── el cliente escribe mal y Max entiende igual ──");
const IGUALES = [
  ["la palabra del producto", "alfombra para hilux", ["alfonbra para hilux", "alfombrra para hilux", "alfombra pra hilux"]],
  ["el modelo", "alfombra hilux", ["alfombra hylux", "alfombra hilus", "alfombra hiluxx"]],
  ["el modelo (Montana)", "alfombra montana", ["alfombra montanna", "alfombra montanna", "alfombra montama"]],
  ["el modelo (Onix)", "alfombra onix", ["alfombra onnix", "alfombra onyx", "alfombra onis"]],
  ["la marca", "alfombra chevrolet onix", ["alfombra chebrolet onix", "alfombra chevrolett onix", "alfombra chevroler onix"]],
  ["la marca (Hyundai)", "alfombra hyundai hb20", ["alfombra hiundai hb20", "alfombra hyunday hb20"]],
];
for (const [que, bien, mal] of IGUALES) {
  const esperado = res(bien);
  ok(esperado.length > 0, `${que}: "${bien}" devuelve algo (si no, el caso no prueba nada)`);
  for (const q of mal) {
    const r = res(q);
    ok(r.length === esperado.length && r.every((n) => esperado.includes(n)),
      `${que}: "${q}" → ${r.length ? r.length + " producto(s), los mismos" : "🚨 NADA"}`);
  }
}

// ── 2. Palabras separadas ─────────────────────────────────────────────────────
console.log("\n── el cliente separa la palabra ──");
for (const [bien, mal] of [["cubreasiento para hilux", "cubre asiento para hilux"],
  ["cubrevolante para hilux", "cubre volante para hilux"]]) {
  const e = res(bien), r = res(mal);
  ok(r.length === e.length, `"${mal}" devuelve lo mismo que "${bien}" (${r.length}/${e.length})`);
}

// ── 3. LO QUE NO PUEDE PASAR: inventar un auto que no vendemos ────────────────
// Un modelo que de verdad no trabajamos tiene que seguir dando "no lo tenemos". Si el
// corrector lo empuja al auto más parecido, le vendemos al cliente el de otro vehículo,
// que es la regla que el dueño pidió que nunca se rompa.
console.log("\n── no puede empujar un auto que no vendemos al más parecido ──");
const NO_EXISTEN = ["alfombra para ferrari", "alfombra para lamborghini", "alfombra para trabant",
  "alfombra para maserati", "alfombra para bentley"];
for (const q of NO_EXISTEN) {
  const r = res(q);
  ok(r.length === 0, `"${q}" sigue sin devolver nada${r.length ? " → 🚨 le ofreció " + r.join(" / ") : ""}`);
}

// ── 4. Ni cruzar dos modelos que existen y se parecen ─────────────────────────
// Los que se diferencian por un número o una letra NO se tocan: son autos distintos.
console.log("\n── los modelos parecidos que SÍ existen no se cruzan ──");
const PARES = [["yuan pro", "yuan plus"], ["geometry c", "geometry e"], ["tiggo 2", "tiggo 7"]];
for (const [a, b] of PARES) {
  const ra = res(`alfombra ${a}`), rb = res(`alfombra ${b}`);
  if (!ra.length && !rb.length) { console.log(`   (saltado: no hay ni ${a} ni ${b} a la venta)`); continue; }
  const cruce = ra.filter((n) => rb.includes(n));
  ok(cruce.length === 0, `"${a}" y "${b}" no comparten productos${cruce.length ? " → 🚨 " + cruce.join(" / ") : ""}`);
}

// ── 5. Barrido: cada modelo del catálogo con UNA letra cambiada ───────────────
// No son casos elegidos a mano: se le cambia una letra a cada modelo real y tiene que
// seguir encontrándose. Es lo que le pasa al cliente que tipea rápido.
console.log("\n── barrido: a cada modelo del catálogo se le cambia una letra ──");
const modelos = new Set();
for (const p of activos) {
  for (const w of norm(p.n).split(" ")) {
    if (w.length >= 5 && /^[a-z]+$/.test(w) && identificaModelo(w)) modelos.add(w);
  }
}
const rotos = [];
let probados = 0;
for (const m of modelos) {
  const esperado = res(`alfombra ${m}`);
  if (!esperado.length) continue;
  // Una letra cambiada en el medio, que es el error de tipeo más común.
  const i = Math.floor(m.length / 2);
  const typo = m.slice(0, i) + (m[i] === "a" ? "e" : "a") + m.slice(i + 1);
  if (modelos.has(typo)) continue; // si el typo ES otro modelo real, no se toca
  probados++;
  const r = res(`alfombra ${typo}`);
  if (r.length !== esperado.length || !r.every((n) => esperado.includes(n))) {
    rotos.push(`${m} → "${typo}" dio ${r.length ? r.length + " distinto(s)" : "NADA"} (esperaba ${esperado.length})`);
  }
}
ok(rotos.length === 0,
  `los ${probados} modelos se encuentran con una letra cambiada${rotos.length ? "\n     ROTOS:\n     - " + rotos.slice(0, 15).join("\n     - ") : ""}`);

console.log("");
if (fallos.length) {
  console.log(`❌ ${pasaron} pasaron, ${fallos.length} fallaron\n`);
  fallos.forEach((f) => console.log("   ❌", f));
  process.exit(1);
}
console.log(`✅ TODO OK — ${pasaron} pasaron, 0 fallaron`);
