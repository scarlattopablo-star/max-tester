// LA REGLA: si el cliente pide algo para SU auto, no se le ofrece el de otro. Y si de
// ese auto no hay, se lo decimos con claridad — nunca se tapa con el producto de otro
// modelo. Pedido de Pablo Scarlatto el 5 de agosto de 2026.
//
// Esta prueba no mira casos sueltos: recorre el catálogo ENTERO, arma para cada
// vehículo la consulta que haría un cliente y revisa las dos cosas que pueden salir mal:
//
//   A) que devuelva el producto de OTRO auto  → le vendemos algo que no le calza;
//   B) que un producto que SÍ está a la venta no aparezca → le decimos que no hay
//      cuando hay.
//
// Corre con: node test_no_ofrecer_otro_auto.mjs   (sin red y sin IA)
process.env.CATALOGO_SIN_DISCO = "1";
import { buscarPrecio, sinStockOInexistente, identificaModelo, textoNormalizado as norm } from "./src/cerebro.js";
import { productos, agotados } from "./src/catalogo_vivo.js";

const MARCAS = new Set(`chevrolet chervolet volkswagen vw toyota ford fiat renault peugeot citroen nissan hyundai
hyudndai kia honda suzuki chery byd jac jmc jmev geely haval changan dongfeng jetour mitsubishi mazda subaru isuzu bmw
mercedes benz audi jeep dodge chrysler foton omoda jaecoo exeed maxus baic faw gac skoda opel tesla volvo ram`.split(/\s+/));
// Palabras del PRODUCTO (no del auto). Sirven para saber dónde empieza el modelo.
const PRODUCTO = new Set(`alfombra alfombras cubreasiento cubreasientos cubrevolante cubre volante asiento asientos
funda fundas kit set juego jgo baul bual caja socalo socalos cubresocalos cubresocales cubesocales pisadera protector
paragolpes conversion lluvero gotero llavero llaves llave carcasa espejo auto autos vehiculo de del para con a en y
goma gomas latex engomado engomada engomadas siliconadas ciliconadas polipropileno propileno polirpopileno vinilo
resina cuero cuerina ecologico ecologica ecolgico ecoligico ecolgica eco premiun premium alta gama capitoneado
capitoneados capitone impermeable impermeables imperemables impremeable imermeables impermeabl imper maxima max
resistencia resitencia resist calidad negro negra gris rojo azul blanco mate original originales orig exclusivas
exclusiva bandeja bandejas rigida rigidas rigido nuevo nueva medida medidas universal universales modelo tela
tapiceria neopreno nopreno logo bordado espesor mm cm delantero delanteros delantera delanteras trasero trasera
traseras tras entera enteras piso pisos piezas dir fabrica adel adelante parte inferior recta tira empuja colocado
colocados colocada instalado especifica termoformadas antiderrame antiderame diseno disenio anos ano sport carbono
genuino agarre silicona metal acrilico resistente fibra type r nuevos new pik cup 3d 5d d
doble simple sencilla cabina cabinas puertas plazas pasajeros pasjero pasajero`.split(/\s+/).filter(Boolean));

const esAnio = (w) => /^\d{4}$/.test(w) && +w >= 1990 && +w <= 2035;
// ¿El texto nombra este término? Misma vara que la búsqueda: palabra entera, y el
// modelo alfanumérico vale escrito junto o separado ("hb20" = "hb 20").
const nombra = (texto, t) => {
  if (new RegExp(`\\b${t}\\b`).test(texto)) return true;
  const partido = t.replace(/^([a-z]{1,4})(\d{1,4})$/, "$1 $2");
  return partido !== t && new RegExp(`\\b${partido}\\b`).test(texto);
};

// El MODELO de una publicación: lo que viene detrás de la marca; si no hay marca, la
// primera palabra que no sea del producto.
function modeloDe(titulo) {
  const t = norm(titulo).split(" ");
  const i = t.findIndex((w) => MARCAS.has(w));
  const desde = i >= 0 ? i + 1 : 0;
  for (let k = desde; k < t.length; k++) {
    const w = t[k];
    if (!w || PRODUCTO.has(w) || MARCAS.has(w) || esAnio(w) || w === "100") continue;
    // Modelos de una sola letra + palabra ("T-Cross", "L 200"): van los dos juntos.
    const frase = w.length === 1 && t[k + 1] ? `${w} ${t[k + 1]}` : w;
    return { modelo: w.length === 1 && t[k + 1] ? t[k + 1] : w, consulta: frase, marca: i >= 0 ? t[i] : null };
  }
  return null;
}
const categoriaDe = (t) => /\balfombra/.test(norm(t)) ? "alfombra" : /cubrevolante|cubre volante/.test(norm(t)) ? "cubrevolante" : /cubreasiento/.test(norm(t)) ? "cubreasiento" : null;

let ok = 0, mal = 0;
function caso(nombre, pasa, detalle = "") {
  console.log(pasa ? `✅ ${nombre}` : `❌ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  pasa ? ok++ : mal++;
}

if (productos().length < 50) {
  console.log("⚠ El snapshot del catálogo está vacío o es de juguete: esta prueba no puede probar nada.");
  process.exit(0);
}

// ── A) Nunca el auto de otro ──────────────────────────────────────────────
const otroAuto = [];
const sinModelo = [];
let consultas = 0;
for (const p of productos()) {
  const info = modeloDe(p.n);
  const c = categoriaDe(p.n);
  if (!info || !c) { sinModelo.push(p.n); continue; }
  // La consulta como la escribe un cliente: producto + marca + modelo.
  const q = [c, info.marca, info.consulta].filter(Boolean).join(" ");
  // Si la consulta no identifica el vehículo, Max no ofrece nada: PREGUNTA el modelo
  // (falta_modelo). Eso se prueba aparte; acá interesa lo que sí llega a ofrecerse.
  if (!identificaModelo(q)) { sinModelo.push(p.n); continue; }
  consultas++;
  for (const r of buscarPrecio(q)) {
    if (!nombra(norm(r.nombre), info.modelo)) otroAuto.push(`"${q}" -> ${r.nombre}`);
  }
}
caso(`ninguna de las ${consultas} consultas devuelve el producto de otro auto`, otroAuto.length === 0, otroAuto.slice(0, 6).join("  ·  "));

// ── B) Nada que esté a la venta queda invisible ───────────────────────────
const invisibles = [];
for (const p of productos()) {
  const info = modeloDe(p.n);
  const c = categoriaDe(p.n);
  if (!info || !c) continue;
  const q = [c, info.marca, info.consulta].filter(Boolean).join(" ");
  if (!identificaModelo(q)) continue;
  if (!buscarPrecio(q).length) invisibles.push(`"${q}" [${p.n}]`);
}
caso("ningún producto a la venta queda sin aparecer", invisibles.length === 0, invisibles.slice(0, 6).join("  ·  "));

// ── C) Cuando no hay, se dice de ESE modelo ───────────────────────────────
// De cada publicación PAUSADA cuyo modelo no tiene nada activo en esa categoría, la
// respuesta tiene que ser "agotado" nombrando ese mismo auto: ni un "no lo trabajamos",
// ni el producto de otro modelo.
// ⚠️ Los CUBREASIENTOS quedan afuera desde el 28 ago 2026: no se agotan, se confeccionan
// a medida, así que la respuesta correcta ahí NO es "agotado" sino "se hace a medida +
// te lo confirma un asesor" (ver test_agotado_producto_correcto.mjs). Que una publicación
// de ML esté pausada no significa que no se pueda fabricar.
const malAvisados = [];
const malAMedida = [];
let revisadas = 0, aMedida = 0;
for (const p of agotados()) {
  const info = modeloDe(p.n);
  const c = categoriaDe(p.n);
  if (!info || !c) continue;
  const q = [c, info.marca, info.consulta].filter(Boolean).join(" ");
  if (!identificaModelo(q) || buscarPrecio(q).length) continue; // hay stock de ese modelo: no aplica
  const s = sinStockOInexistente(q);
  if (c === "cubreasiento") {
    aMedida++;
    // Ni "agotado" ni "no lo trabajamos": tiene que ir por el camino del a medida.
    if (s.agotado || !s.aMedida) malAMedida.push(`"${q}" -> ${s.agotado ? `dijo AGOTADO (${s.producto})` : "no marcó a medida"}`);
    continue;
  }
  revisadas++;
  if (!s.agotado || !nombra(norm(s.producto || ""), info.modelo)) {
    malAvisados.push(`"${q}" -> ${s.agotado ? s.producto : "dijo que no lo trabajamos"}`);
  }
}
caso(`las ${revisadas} sin stock se avisan como agotado DEL MISMO auto`, malAvisados.length === 0, malAvisados.slice(0, 6).join("  ·  "));
caso(`los ${aMedida} cubreasientos pausados se resuelven A MEDIDA, nunca como agotados`, malAMedida.length === 0, malAMedida.slice(0, 6).join("  ·  "));

console.log(`\n(consultas revisadas: ${consultas} · publicaciones sin modelo identificable en el título: ${sinModelo.length})`);
console.log(mal ? `\n❌ ${mal} fallaron, ${ok} pasaron` : `\n✅ TODO OK — ${ok} pasaron, 0 fallaron`);
process.exit(mal ? 1 : 0);
