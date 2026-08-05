// EL PUNTO CIEGO: el cliente no escribe el modelo como está cargado en Mercado Libre.
//
// Los otros test arman la consulta COPIANDO el título de la publicación, así que nunca
// prueban lo que de verdad pasa: el título dice "Changan Unit" y el cliente escribe
// "Changan Uni-T"; el título dice "L200" y el cliente escribe "L 200". Ahí la búsqueda
// devolvía cero y Max le contestaba "no hay" habiendo stock. Eso es lo que mira este
// archivo. Pedido de Pablo Scarlatto el 5 de agosto de 2026 ("no pueden haber más
// errores al respecto").
//
// Corre con: node test_cliente_escribe_distinto.mjs   (sin red y sin IA)
process.env.CATALOGO_SIN_DISCO = "1";
import { buscarPrecio, identificaModelo, textoNormalizado as norm } from "./src/cerebro.js";
import { productos, agotados } from "./src/catalogo_vivo.js";

let pasaron = 0;
const fallos = [];
const ok = (cond, msg) => (cond ? (pasaron++, console.log("✅", msg)) : fallos.push(msg));

const activos = productos();
const porId = new Map([...activos, ...agotados()].map((p) => [p.id, p.n]));
const ids = (q) => new Set((buscarPrecio(q) || []).map((p) => p.id));
const titulo = (id) => porId.get(id) || id;
// Palabras del producto/color: no son el nombre del auto, así que juntarlas o separarlas
// no dice nada ("bandeja"+"rigida" → "bandejarigida" no es un modelo).
const STOP = new Set(`alfombra alfombras cubreasiento cubreasientos cubre cubrevolante volante asiento asientos
funda fundas negro negra gris rojo azul blanco beige cuero cuerina ecologico ecologica premium alta gama capitoneado
impermeable impermeables medida medidas para del con set juego completo auto autos vehiculo original originales goma
engomado engomadas latex bandeja bandejas rigida rigidas rigido baul caja socalo socalos cubresocalos vinilo resina
maxima resistencia resitencia calidad piezas colocado colocados cabina simple doble puertas sedan hatch hatchback
antiderrame antiderrames polipropileno propileno tela tapiceria neopreno logo bordado espesor delantero trasero
universal nuevo nueva modelo marca kit conversion paragolpes espejo pisadera lluvero gotero carga tira empuja
flexibilidad pasajeros adel adelante parte inferior recta`.split(/\s+/));

// ── 1. El modelo separado, con guión o pegado son EL MISMO auto ───────────────
// El cliente escribe "Uni-T" porque así se llama el auto; el título dice "Unit".
console.log("\n── el cliente escribe el modelo distinto a como está en ML ──");
const MISMA_COSA = [
  ["Changan Uni-T", ["alfombra changan uni-t", "alfombra changan uni t", "alfombra changan unit"]],
  ["Mitsubishi L200", ["alfombra mitsubishi l-200", "alfombra mitsubishi l 200", "alfombra mitsubishi l200"]],
  ["Hyundai HB20", ["alfombra hyundai hb-20", "alfombra hyundai hb 20", "alfombra hyundai hb20"]],
  ["VW T-Cross", ["alfombra vw t-cross", "alfombra vw t cross", "alfombra vw tcross"]],
];
for (const [auto, formas] of MISMA_COSA) {
  const sets = formas.map(ids);
  const union = new Set(sets.flatMap((s) => [...s]));
  ok(union.size > 0, `${auto}: hay algo para ese auto (si no, el caso no prueba nada)`);
  formas.forEach((f, i) => {
    ok(sets[i].size === union.size,
      `${auto}: "${f}" devuelve lo mismo que las otras formas (${sets[i].size}/${union.size})`);
  });
}

// ── 2. Una LETRA no es un detalle: Geometry C y Geometry E son autos distintos ──
// Misma regla que Yuan Pro / Yuan Plus. Antes la letra suelta se descartaba por corta
// y al del Geometry C le salía primero el del E.
console.log("\n── modelos que se diferencian por una sola letra ──");
const conLetra = activos.filter((p) => /\bgeometry [ce]\b/.test(norm(p.n)));
if (conLetra.length >= 2) {
  for (const p of conLetra) {
    const letra = norm(p.n).match(/\bgeometry ([ce])\b/)[1];
    const res = ids(`alfombra geely geometry ${letra}`);
    const ajenos = [...res].filter((id) => !new RegExp(`\\bgeometry ${letra}\\b`).test(norm(titulo(id))));
    ok(res.has(p.id), `Geometry ${letra.toUpperCase()}: encuentra el suyo`);
    ok(ajenos.length === 0,
      `Geometry ${letra.toUpperCase()}: NO le ofrece el de la otra letra${ajenos.length ? " → " + ajenos.map(titulo).join(" / ") : ""}`);
  }
} else {
  console.log("   (saltado: el catálogo ya no tiene dos Geometry)");
}

// ── 3. Barrido: TODO modelo alfanumérico se encuentra escrito de las 3 formas ──
// Acá está el punto ciego de verdad: no son 4 casos elegidos a mano, es el catálogo.
console.log("\n── barrido del catálogo: modelos tipo L200 / HB20 / T60 ──");
const perdidas = [];
let revisados = 0;
for (const p of activos) {
  const m = norm(p.n).match(/\b([a-z]{1,3})(\d{2,3})\b/);
  if (!m) continue;
  const [tok, letras, nums] = m;
  if (nums === "100") continue; // viene de "100 % goma", no es el modelo
  revisados++;
  const base = norm(p.n).replace(tok, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
  for (const forma of [`${letras} ${nums}`, `${letras}-${nums}`, `${letras}${nums}`]) {
    if (!ids(`${base} ${forma}`).has(p.id)) perdidas.push(`${p.n} → escrito "${forma}"`);
  }
}
ok(perdidas.length === 0,
  `los ${revisados} modelos alfanuméricos se encuentran con espacio, con guión y pegados${perdidas.length ? "\n     PERDIDAS:\n     - " + perdidas.slice(0, 12).join("\n     - ") : ""}`);

// ── 3bis. El MISMO modelo escrito con el espacio en otro lado, dentro del catálogo ──
// No es solo el cliente: Mercado Libre tiene el mismo auto cargado de dos formas
// ("Changan Unit" y "Changan U-nit"). Si la búsqueda las toma por autos distintos, el
// que pregunta ve la mitad de lo que hay. Esto barre el catálogo buscando ese caso, así
// no hay que ir descubriéndolos de a uno.
console.log("\n── el catálogo escribe el mismo modelo de dos formas ──");
const tokens = new Map(); // token pegado -> ids que lo traen pegado
const partidos = new Map(); // token pegado -> ids que lo traen partido en dos
for (const p of activos) {
  const t = norm(p.n).split(" ");
  for (const w of t) {
    if (w.length < 4 || !/^[a-z]+$/.test(w) || STOP.has(w)) continue;
    if (!tokens.has(w)) tokens.set(w, new Set());
    tokens.get(w).add(p.id);
  }
  for (let i = 0; i < t.length - 1; i++) {
    const junto = t[i] + t[i + 1];
    if (junto.length < 4 || !/^[a-z]+$/.test(junto) || STOP.has(junto)) continue;
    if (!partidos.has(junto)) partidos.set(junto, new Set());
    partidos.get(junto).add(p.id);
  }
}
let paresRevisados = 0;
for (const [w, conJunto] of tokens) {
  const conPartido = partidos.get(w);
  if (!conPartido) continue;
  const todos = new Set([...conJunto, ...conPartido]);
  if (todos.size < 2) continue;
  paresRevisados++;
  const res = ids(`alfombra ${w}`);
  const faltan = [...todos].filter((id) => !res.has(id));
  ok(faltan.length === 0,
    `"${w}": las ${todos.size} publicaciones del mismo modelo salen juntas${faltan.length ? " → falta " + faltan.map(titulo).join(" / ") : ""}`);
}
if (!paresRevisados) console.log("   (el catálogo no tiene ningún modelo escrito de las dos formas)");

// ── 4. La palabra del PRODUCTO no dice qué auto tiene el cliente ───────────────
// Si no sabemos el vehículo hay que preguntarlo, no tirar el producto de cualquier auto.
console.log("\n── sin el auto, Max pregunta (falta_modelo) ──");
const SOLO_PRODUCTO = ["antiderrame", "latex", "bandejas", "3d", "5d", "baul", "caja", "socalo",
  "cubresocalos", "quiero una alfombra antiderrame", "tenes bandeja rigida antiderrame",
  "precio de la 3d antiderrame", "alfombra de baul", "alfombra de caja"];
for (const q of SOLO_PRODUCTO) {
  ok(!identificaModelo(q), `"${q}" no alcanza para saber qué auto tiene → pregunta`);
}
// Y al revés: nombrar el auto SÍ tiene que alcanzar (que no se pase de estricto).
for (const q of ["alfombra antiderrame para hilux", "bandeja 3d montana", "alfombra de caja ranger"]) {
  ok(identificaModelo(q), `"${q}" sí dice qué auto tiene → cotiza`);
}

// ── 5. No perder la distinción entre productos al arreglar lo de arriba ───────
// "caja" y "baúl" separan productos distintos del MISMO auto: no pueden volverse
// palabras vacías o al que pide la de caja le sale la de bandeja.
console.log("\n── caja / baúl / bandeja siguen siendo productos distintos ──");
const caja = [...ids("alfombra de caja para montana")].map(titulo);
if (caja.length) {
  ok(caja.every((n) => /caja/i.test(n)),
    `"alfombra de caja para montana" trae solo las de caja → ${caja.join(" / ")}`);
} else {
  console.log("   (saltado: no hay alfombra de caja de Montana a la venta)");
}

// ── 6. El ACABADO que el título no nombra no puede dejar la venta en cero ─────
// La bandeja rígida de la Montana está publicada como "Alfombra Montana Bandeja", sin
// el "3d". El cliente pidió "alfombra 3d para montana 25", el título no traía la palabra
// y Max le dijo que estaba agotada teniéndola (caso real del 5 ago 2026).
console.log("\n── el acabado (3d, antiderrame) no puede tapar lo que sí hay ──");
for (const [q, auto] of [["alfombra 3d para montana 25", "montana"], ["alfombra antiderrame para montana", "montana"]]) {
  const res = [...ids(q)].map(titulo);
  const hayDelAuto = activos.some((p) => new RegExp(`\\b${auto}\\b`).test(norm(p.n)) && /alfombra/i.test(norm(p.n)));
  if (!hayDelAuto) { console.log(`   (saltado: no hay alfombras de ${auto} a la venta)`); continue; }
  ok(res.length > 0, `"${q}" devuelve lo que hay del auto en vez de decir que no hay`);
  ok(res.every((n) => new RegExp(`\\b${auto}\\b`).test(norm(n))),
    `"${q}" no se va a otro auto → ${res.join(" / ") || "(nada)"}`);
}

// Pero la PIEZA sí manda: la de caja no es la de bandeja, y cambiársela al cliente es
// venderle lo que no pidió. Esto no puede aflojarse junto con el acabado.
console.log("\n── la PIEZA (caja / baúl / socalo) sigue siendo obligatoria ──");
for (const pieza of ["caja", "baul", "cubresocalos"]) {
  const conPieza = activos.filter((p) => new RegExp(`\\b${pieza}\\b`).test(norm(p.n)));
  if (!conPieza.length) { console.log(`   (saltado: no hay ninguna de ${pieza} a la venta)`); continue; }
  // La consulta es el título de la propia publicación: así identifica el auto sin que el
  // test tenga que adivinar el modelo. Si la pieza dejara de exigirse, volverían también
  // las del MISMO auto que no la llevan, y eso es lo que acá tiene que fallar.
  const res = [...ids(conPieza[0].n)].map(titulo);
  ok(res.length > 0 && res.every((n) => new RegExp(`\\b${pieza}\\b`).test(norm(n))),
    `pidiendo "${conPieza[0].n}" vuelven solo las de ${pieza} → ${res.join(" / ") || "(nada)"}`);
}

console.log("");
if (fallos.length) {
  console.log(`❌ ${pasaron} pasaron, ${fallos.length} fallaron\n`);
  fallos.forEach((f) => console.log("   ❌", f));
  process.exit(1);
}
console.log(`✅ TODO OK — ${pasaron} pasaron, 0 fallaron`);
