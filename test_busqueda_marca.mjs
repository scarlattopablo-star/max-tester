// Caso real del 5 de agosto de 2026: preguntaron por "artículos para montaña"
// (Chevrolet Montana) y Max contestó que estaba agotado. El stock estaba: hay 4
// publicaciones ACTIVAS de Montana. Fallaba la búsqueda, no el stock.
//
// Dos motivos, los dos cubiertos acá:
//   1) las palabras con las que el cliente arma la pregunta ("artículos", "tenés",
//      "accesorios") se exigían dentro del título del producto → 0 resultados;
//   2) la MARCA se exigía dentro del título, y los títulos activos de Montana dicen
//      "Montana" a secas o "Chervolet" (mal escrito en Mercado Libre) → 0 resultados.
// Con 0 resultados Max pasaba a la lista de AGOTADOS, donde sí hay una alfombra de
// Montana pausada, y le decía al cliente que no había stock.
//
// Corre con: node test_busqueda_marca.mjs   (sin red y sin IA: solo la búsqueda)
process.env.CATALOGO_SIN_DISCO = "1";
import { buscarPrecio, buscarAgotado, sinStockOInexistente } from "./src/cerebro.js";
import { productos, agotados } from "./src/catalogo_vivo.js";

let ok = 0, mal = 0;
function caso(nombre, pasa, detalle = "") {
  console.log(pasa ? `✅ ${nombre}` : `❌ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  pasa ? ok++ : mal++;
}

// ── Guarda de datos: si el catálogo cambió, el test avisa en vez de mentir ──
const activasMontana = productos().filter((p) => /montana/i.test(p.n));
const pausadasMontana = agotados().filter((p) => /montana/i.test(p.n));
if (!activasMontana.length || !pausadasMontana.length) {
  console.log("⚠ El snapshot ya no tiene Montana activa Y pausada a la vez: este test no puede probar nada. Revisalo.");
  process.exit(0);
}
console.log(`(catálogo: ${activasMontana.length} Montana activas, ${pausadasMontana.length} pausadas)\n`);

// ── 1) La pregunta tal cual la escribe el cliente ─────────────────────────
for (const q of [
  "articulos para montaña",
  "accesorios para montaña",
  "que tenes para la montaña",
  "hola, necesito algo para mi montana",
]) {
  const r = buscarPrecio(q);
  caso(`"${q}" encuentra productos`, r.length > 0, "no devolvió nada");
}

// ── 2) La marca no puede dejar la búsqueda en cero ────────────────────────
// Los títulos activos son "Alfombra Montana Bandeja Negro" y "Alfombra Chervolet
// Montana 100 % Goma Negro": ninguno dice "Chevrolet" bien escrito.
const conMarca = buscarPrecio("alfombra chevrolet montana");
caso("\"alfombra chevrolet montana\" devuelve las alfombras activas", conMarca.length > 0, "no devolvió nada");
caso("y son todas de Montana", conMarca.every((x) => /montana/i.test(x.nombre)), conMarca.map((x) => x.nombre).join(" | "));
caso("y son todas alfombras (no cambia de categoría)", conMarca.every((x) => /alfombra/i.test(x.nombre)), conMarca.map((x) => x.nombre).join(" | "));

// ── 3) Lo que veía el cliente: agotado cuando había stock ─────────────────
const r3 = sinStockOInexistente("alfombra chevrolet montana");
caso("ya no cae en la lista de agotados", !buscarPrecio("alfombra chevrolet montana").length ? r3.agotado !== true : true, JSON.stringify(r3).slice(0, 120));

// ── 4) La ñ es la misma letra que la n ────────────────────────────────────
caso(
  "\"montaña\" y \"montana\" devuelven lo mismo",
  JSON.stringify(buscarPrecio("alfombra montaña").map((x) => x.id)) === JSON.stringify(buscarPrecio("alfombra montana").map((x) => x.id)),
);

// ── 4 bis) HB20: la marca no puede ESCONDER productos ─────────────────────
// Reporte del 5 de agosto: "le piden para hb20 que también hay en stock y dice que no
// hay". Con la marca obligatoria, "cubreasiento hyundai hb20" mostraba 1 solo de los 3
// (el único cuyo título dice "Hyundai") y escondía las dos opciones a medida.
const hb20 = productos().filter((p) => /hb ?20/i.test(p.n));
if (hb20.length >= 3) {
  const conMarca = buscarPrecio("cubreasiento hyundai hb20");
  const sinMarca = buscarPrecio("cubreasiento hb20");
  caso("con marca y sin marca traen lo mismo", conMarca.length === sinMarca.length && conMarca.length > 1, `${conMarca.length} vs ${sinMarca.length}`);
  caso("y el que sí dice Hyundai queda primero", /hyundai/i.test(conMarca[0]?.nombre || ""), conMarca[0]?.nombre);
  for (const q of ["alfombra hb20", "alfombra hyundai hb20", "alfombra hb 20", "alfombras para hb 20"]) {
    caso(`"${q}" encuentra alfombras`, buscarPrecio(q).length > 0, "no devolvió nada");
  }
  // El cliente escribe el modelo junto y el título lo tiene separado ("Cubrevolante Hb 20").
  const vol = buscarAgotado("cubrevolante hb20");
  caso("\"cubrevolante hb20\" reconoce el agotado (no dice que no lo trabajamos)", !!vol && /hb ?20/i.test(vol.nombre), vol?.nombre || "(nada)");
}

// ── 4 ter) Títulos con la palabra del producto mal escrita ────────────────
// "Alfomrba Vw Nivus", "Alombra Changan Cs55", "Cuberasiento Toyota Hilux": si la
// errata deja al producto fuera del filtro de categoría, al cliente que pide una
// alfombra le decimos que no hay.
const conErrata = productos().filter((p) => /alfomrba|alfombrra|alfomra|alombra|cuberasiento|curbeasiento/i.test(p.n));
if (conErrata.length) {
  const perdidos = conErrata.filter((p) => {
    const cat = /cuberasiento|curbeasiento/i.test(p.n) ? "cubreasiento" : "alfombra";
    const modelo = p.n.replace(/^\S+\s+/, "").split(/\s+/).slice(0, 2).join(" ");
    return !buscarPrecio(`${cat} ${modelo}`).some((x) => x.id === p.id);
  });
  caso(`los ${conErrata.length} activos con la palabra mal escrita se encuentran igual`, perdidos.length === 0, perdidos.map((p) => p.n).join(" | "));
}

// ── 5) Lo que NO se aflojó: el modelo sigue mandando ──────────────────────
// Aflojar la marca no puede reabrir el cruce de variantes (Yuan PRO ≠ Yuan PLUS).
const hayVariantes = [...productos(), ...agotados()].some((p) => /yuan plus/i.test(p.n)) && [...productos(), ...agotados()].some((p) => /yuan pro/i.test(p.n));
if (hayVariantes) {
  for (const q of ["alfombra byd yuan pro", "alfombra yuan pro"]) {
    caso(`"${q}" no devuelve ningún PLUS`, buscarPrecio(q).every((x) => !/plus/i.test(x.nombre)));
  }
  const ago = buscarAgotado("alfombra byd yuan pro");
  caso("el agotado del Yuan Pro sigue siendo del Yuan Pro", !ago || /yuan pro/i.test(ago.nombre), ago?.nombre || "(nada)");
}

// Un producto que de verdad no tenemos sigue dando "no lo tenemos": aflojar la marca
// no puede convertir cualquier consulta en una venta.
const inventado = buscarPrecio("alfombra ferrari testarossa");
caso("un vehículo que no trabajamos sigue sin resultados", inventado.length === 0, inventado.map((x) => x.nombre).join(" | "));

// Aflojar la marca tampoco puede cruzar modelos parecidos: el número del modelo y las
// palabras enteras son lo que separa un auto de otro.
const cruces = [
  ["alfombra chery tiggo 2", /tiggo ?[4789]/i, "no trae un Tiggo de otro número"],
  ["alfombra bmw x1", /\bix1\b/i, "el X1 no trae el iX1 (son autos distintos)"],
  ["alfombra citroen c4", /xc40/i, "el C4 no trae el Volvo XC40"],
  ["alfombra volkswagen gol", /golf/i, "el Gol no trae el Golf"],
];
for (const [q, prohibido, nombre] of cruces) {
  const r = buscarPrecio(q).filter((x) => prohibido.test(x.nombre));
  caso(nombre, r.length === 0, r.map((x) => x.nombre).join(" | "));
}

// Y el que está pausado de verdad sigue marcándose como agotado (no lo tapamos).
const cajaPausada = pausadasMontana.some((p) => /de caja/i.test(p.n));
if (cajaPausada) {
  const r5 = sinStockOInexistente("alfombra de caja montana");
  caso("la alfombra de caja de la Montana sigue dando agotado", r5.agotado === true, JSON.stringify(r5).slice(0, 120));
}

// ── 6) Barrido: ninguna búsqueda del catálogo se queda en cero ────────────
// Buscar un producto que está a la venta por su propio título tiene que devolver ALGO:
// una búsqueda en cero es la que hace que Max se vaya a la lista de agotados.
const vacias = productos().filter((p) => buscarPrecio(p.n).length === 0);
caso(`los ${productos().length} títulos activos devuelven algo`, vacias.length === 0, vacias.map((p) => p.n).slice(0, 5).join(" | "));

// Y el producto activo, además, tiene que encontrarse A SÍ MISMO. Se saltean los
// títulos que son puro texto genérico ("Cubreasiento Eco Cuero Logo Bordado Medidas
// Universales"): ahí no hay modelo que buscar y la búsqueda devuelve la categoría.
const conModelo = productos().filter((p) => buscarPrecio(p.n).length <= 6 && /[a-z]/i.test(p.n));
const huerfanos = conModelo.filter((p) => {
  const r = buscarPrecio(p.n);
  return r.length < 6 && !r.some((x) => x.id === p.id); // 6 = tope de resultados, ahí puede quedar afuera
});
caso("cada producto activo se encuentra por su título", huerfanos.length === 0, huerfanos.map((p) => p.n).slice(0, 5).join(" | "));

console.log(mal ? `\n❌ ${mal} fallaron, ${ok} pasaron` : `\n✅ TODO OK — ${ok} pasaron, 0 fallaron`);
process.exit(mal ? 1 : 0);
