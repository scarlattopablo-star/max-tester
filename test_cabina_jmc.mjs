// Los camiones JMC de doble cabina y de cabina simple se cotizaban IGUAL (26 ago 2026).
//
// Lo que hay publicado en Mercado Libre:
//   $18.000  Cubreasiento Jmc DOBLE CABINA Jx1044       ← la única que declara la cabina
//   $18.000  Cubreasiento Jmc Grand Avenue
//   $ 9.500  Cubreasiento Jmc Ev3                        ← auto, no camión
//   $ 6.900  Cubreasientos Jmc N822 2850 Eco Cuero
//   $11.900  Cubreasiento Jmc N822 2850 Carryng Plus
//   (pausadas) Alfombra ... N822 2850 CAB SIMPLE   y   Alfombra ... DOBLE CABINA N822 2850
//
// Esas dos alfombras son la prueba de que el N822 2850 se vende en LAS DOS cabinas: por
// eso sus cubreasientos, que no la aclaran, no se pueden dar por buenos para ninguna.
//
// Corre con: node test_cabina_jmc.mjs   (sin red y sin IA, solo el catálogo real)
process.env.CATALOGO_SIN_DISCO = "1";
import { buscarPrecio, buscarAgotado, cabinaDelProducto, cabinaAmbigua, mezclaCabinas, cabinaDe, cabinaSinConfirmar } from "./src/cerebro.js";
import { productos, agotados } from "./src/catalogo_vivo.js";

let ok = 0, mal = 0;
function caso(nombre, pasa, detalle = "") {
  console.log(pasa ? `✅ ${nombre}` : `❌ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  pasa ? ok++ : mal++;
}
const precios = (r) => r.map((x) => x.precio).sort((a, b) => a - b).join(",");
const nombres = (r) => r.map((x) => `$${x.precio} ${x.nombre}`).join(" | ");

// ── Guardas de datos: si el catálogo cambió, el test avisa en vez de mentir ──
const todo = [...productos(), ...agotados()];
const hayJx = productos().some((p) => /jx1044/i.test(p.n));
const hayN822 = productos().filter((p) => /n822/i.test(p.n) && /cubreasiento/i.test(p.n)).length >= 2;
const hayAlfombrasN822 = todo.some((p) => /n822.*cab simple/i.test(p.n)) && todo.some((p) => /doble cabina n822/i.test(p.n));
if (!hayJx || !hayN822 || !hayAlfombrasN822) {
  console.log("⚠ El catálogo ya no tiene el JX1044, los dos cubreasientos del N822 y las dos alfombras (Cab Simple / Doble Cabina): este test no puede probar nada. Revisalo.");
  process.exit(0);
}

// ── 1) La cabina se lee como la escribe Mercado Libre ─────────────────────
caso('"Doble Cabina Jx1044" se lee doble', cabinaDelProducto("Cubreasiento Jmc Doble Cabina Jx1044 Cuero Ecologico Negro") === "doble");
caso('"Cab Simple" se lee simple', cabinaDelProducto("Alfombra Bandeja Camion Jmc N822 2850 Cab Simple Negro") === "simple");
// Notaciones que el lector NO veía y por eso el VW Saveiro tenía el mismo bug.
caso('"D/cabina" (con barra) se lee doble', cabinaDelProducto("Cubreasiento Vw Saveiro Cuero Ecologico Capitoneado D/cabina Negro") === "doble");
caso('"Pik Up" a secas se lee simple', cabinaDelProducto("Cubreasiento Vw Saveiro Pik Up Cuero Ecologico Capitoneado Negro") === "simple");
// ⛔ El VW Up NO es una "pick up": si se leyera como cabina simple, el filtro le sacaría
// productos al cliente del Up.
caso("el VW Up no se confunde con una pick up", cabinaDelProducto("Cubreasiento Vw Up Cuero Ecologio Capitoneado Alta Gama Negro") === null);

// ── 2) Una publicación muda de un camión de dos cabinas es AMBIGUA ────────
caso("el cubreasiento del N822 2850 queda como ambiguo", cabinaAmbigua("Cubreasientos Jmc N822 2850 Eco Cuero Impermeables Negro"));
caso("el del EV3 (auto de una sola cabina) NO es ambiguo", !cabinaAmbigua("Cubreasiento Jmc Ev3 Cuero Ecolgico Alta Gama Gris"));
caso("la que sí declara la cabina nunca es ambigua", !cabinaAmbigua("Cubreasiento Jmc Doble Cabina Jx1044 Cuero Ecologico Negro"));

// ── 3) "camión" ya no deja la búsqueda en cero ────────────────────────────
// Era el motivo de que las dos cabinas recibieran EXACTAMENTE la misma respuesta:
// las dos daban cero y Max contestaba la frase genérica de JMC + pase a un asesor.
const camionDoble = buscarPrecio("cubreasiento para mi camion jmc doble cabina");
const camionSimple = buscarPrecio("cubreasiento para mi camion jmc cabina simple");
caso('"camión jmc doble cabina" encuentra productos', camionDoble.length > 0);
caso('"camión jmc cabina simple" encuentra productos', camionSimple.length > 0);
caso("y ya NO devuelven lo mismo", precios(camionDoble) !== precios(camionSimple), `doble=[${precios(camionDoble)}] simple=[${precios(camionSimple)}]`);

// ── 4) Cada cabina recibe lo suyo ─────────────────────────────────────────
caso("al de DOBLE cabina no le sale el N822 de $6.900", !camionDoble.some((x) => /n822/i.test(x.nombre)), nombres(camionDoble));
caso("al de DOBLE cabina sí le sale la publicación Doble Cabina Jx1044", camionDoble.some((x) => /jx1044/i.test(x.nombre)), nombres(camionDoble));
caso("al de CABINA SIMPLE no le sale la Doble Cabina Jx1044 de $18.000", !camionSimple.some((x) => /jx1044/i.test(x.nombre)), nombres(camionSimple));

// ── 5) Sin saber la cabina, no se cotiza: se pregunta ─────────────────────
// El N822 2850 se vende en las dos y sus cubreasientos no lo aclaran.
const n822 = buscarPrecio("cubreasiento jmc n822 2850");
caso("la búsqueda del N822 2850 trae sus dos publicaciones", n822.length === 2, nombres(n822));
caso("y pide preguntar la cabina antes de cotizar", mezclaCabinas(n822), nombres(n822));
caso("el cliente no dijo la cabina", cabinaDe("cubreasiento jmc n822 2850") === null);

// ── 5 bis) Con la cabina dicha, se cotiza pero se CONFIRMA ────────────────
// Ninguno de los dos cubreasientos del N822 declara la cabina: el precio es real, pero
// no se le puede asegurar al cliente que es el de la suya.
const n822Doble = buscarPrecio("cubreasiento jmc n822 2850 doble cabina");
caso("con la cabina dicha igual devuelve las dos publicaciones", n822Doble.length === 2, nombres(n822Doble));
caso("y pide confirmarle la cabina antes de cerrar", cabinaSinConfirmar(n822Doble, "cubreasiento jmc n822 2850 doble cabina", "") === "doble");
caso("lo mismo para la cabina simple", cabinaSinConfirmar(buscarPrecio("cubreasiento jmc n822 2850 cabina simple"), "cubreasiento jmc n822 2850 cabina simple", "") === "simple");
// Cuando Mercado Libre SÍ la declara no hay nada que confirmar: la publicación manda.
caso("el JX1044 no necesita confirmación", cabinaSinConfirmar(buscarPrecio("cubreasiento jmc jx1044 doble cabina"), "cubreasiento jmc jx1044 doble cabina", "") === null);
caso("el Saveiro tampoco", cabinaSinConfirmar(buscarPrecio("cubreasiento saveiro doble cabina"), "cubreasiento saveiro doble cabina", "") === null);
// Y si el cliente nunca dijo la cabina, este aviso no corre: corre el freno de arriba.
caso("sin cabina dicha no hay aviso de confirmación", cabinaSinConfirmar(n822, "cubreasiento jmc n822 2850", "") === null);

// ── 6) La alfombra del N822 va a la cabina correcta ───────────────────────
const alfDoble = buscarAgotado("alfombra jmc n822 2850 doble cabina");
const alfSimple = buscarAgotado("alfombra jmc n822 2850 cabina simple");
caso("la alfombra de doble cabina es la Doble Cabina", !!alfDoble && /doble cabina/i.test(alfDoble.nombre), alfDoble?.nombre || "(nada)");
caso("la alfombra de cabina simple es la Cab Simple", !!alfSimple && /cab simple/i.test(alfSimple.nombre), alfSimple?.nombre || "(nada)");

// ── 7) El VW Saveiro tenía el mismo bug y también quedó arreglado ─────────
const savDoble = buscarPrecio("cubreasiento saveiro doble cabina");
const savSimple = buscarPrecio("cubreasiento saveiro cabina simple");
caso("Saveiro doble cabina → solo la D/cabina", savDoble.length === 1 && /d\/cabina/i.test(savDoble[0].nombre), nombres(savDoble));
caso("Saveiro cabina simple → solo la Pik Up", savSimple.length === 1 && /pik up/i.test(savSimple[0].nombre), nombres(savSimple));

// ── 8) La Fiat Strada no perdió nada (control de no-regresión) ────────────
// Sus otras LÍNEAS (capitoneado, tela, lona) no declaran cabina, pero son del MISMO
// camión que la "Strada D Cabina": se siguen ofreciendo.
const strDoble = buscarPrecio("cubreasiento strada doble cabina");
const strSimple = buscarPrecio("cubreasiento strada cabina simple");
caso("Strada doble cabina sigue mostrando varias líneas", strDoble.length >= 4, nombres(strDoble));
caso("Strada doble cabina incluye la D Cabina", strDoble.some((x) => /d cabina/i.test(x.nombre)), nombres(strDoble));
caso("Strada doble cabina NO incluye la Pik Up 2 Asientos", !strDoble.some((x) => /pik up/i.test(x.nombre)), nombres(strDoble));
caso("Strada cabina simple incluye la Pik Up 2 Asientos", strSimple.some((x) => /pik up/i.test(x.nombre)), nombres(strSimple));
caso("Strada cabina simple NO incluye la D Cabina", !strSimple.some((x) => /d cabina/i.test(x.nombre)), nombres(strSimple));

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
