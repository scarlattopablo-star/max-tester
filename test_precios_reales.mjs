// UN PRECIO QUE MAX NO SACÓ DE LA HERRAMIENTA ES UN PRECIO INVENTADO.
//
// Caso real del 5 de agosto de 2026 (captura de Pablo): el cliente preguntó "tenes
// alfomrba para hb20?" y Max contestó "la alfombra bandeja rígida para tu HB20 está
// disponible, sale $2.850". La bandeja del HB20 sale **$3.360**. Y "$2.850" no es el
// precio de NINGUNA publicación, ni activa ni pausada: se lo inventó, junto con el
// nombre ("Alfombra Hb20 Bandeja Rigida Negro" tampoco existe; la real se llama
// "Alfombra Hb20 Bandeja 3d Negro"). Después lo repitió: "tal como te comenté recién".
//
// Un control contra TODO el catálogo no sirve: probado, $2.850 entra por casualidad
// (cae dentro del 4,8% de números de 4 cifras que serían "explicables" como el 10% de
// descuento de algún otro producto). El control tiene que ser contra los precios que la
// herramienta devolvió EN ESE TURNO, que son cinco números y no seiscientos.
//
// Corre con: node test_precios_reales.mjs   (sin red y sin IA)
process.env.CATALOGO_SIN_DISCO = "1";
import { filtrarPrecios } from "./src/cerebro.js";

let pasaron = 0;
const fallos = [];
const ok = (cond, msg) => (cond ? (pasaron++, console.log("✅", msg)) : fallos.push(msg));

// Lo que devolvió consultar_precio para el HB20 (precios reales de producción).
const HB20 = [{
  herramienta: "consultar_precio",
  resultado: { encontrado: true, moneda: "UYU", resultados: [
    { id: "MLU645259495", nombre: "Alfombra Hb20 Bandeja 3d Negro", precio: 3360, precio_lista: 4200, moneda: "UYU" },
    { id: "MLU727613856", nombre: "Alfombra Baul Hb20 Hatch Engomadas", precio: 1890, moneda: "UYU" },
    { id: "MLU907444290", nombre: "Alfombra Baúl Hb20 Sedan Bandeja 3d", precio: 2672, precio_lista: 2900, moneda: "UYU" },
  ] },
}];

console.log("\n── el caso de la captura ──");
const malo = filtrarPrecios("¡Hola de nuevo! Sí, la alfombra bandeja rígida para tu HB20 está disponible, sale $2.850. ¿Te interesa?", HB20);
ok(malo.inventado === 2850, `detecta que $2.850 no salió de la herramienta (inventado: ${malo.inventado})`);
ok(!/2\.?850/.test(malo.texto), `y NO se lo manda al cliente → ${JSON.stringify(malo.texto)}`);
// ⚠️ El punto de "$2.850" NO es un fin de frase: si se corta ahí queda un "850." suelto,
// que al cliente le resulta más raro todavía que el precio equivocado.
ok(!/\b850\b/.test(malo.texto), `no deja el pedazo del número suelto → ${JSON.stringify(malo.texto)}`);
ok(!/\d/.test(malo.texto.replace(/10%/g, "")), `no queda ninguna cifra suelta → ${JSON.stringify(malo.texto)}`);

console.log("\n── los precios de verdad pasan intactos ──");
for (const [t, motivo] of [
  ["La alfombra bandeja 3D para tu HB20 sale $ 3.360. ¿Te interesa?", "el precio real"],
  ["Tengo la de baúl a $1.890 y la bandeja a $3.360.", "dos precios reales en un mensaje"],
  ["El precio de lista es $ 4.200 y te queda en $ 3.360.", "precio de lista + precio final"],
  ["Con transferencia tenés 10% de descuento: te queda en $3.024.", "el 10% calculado"],
  ["Con transferencia te queda en $3.020.", "el 10% redondeado"],
  ["Llevando las dos te quedan en $ 5.250.", "la suma de dos productos"],
]) {
  const r = filtrarPrecios(t, HB20);
  ok(r.inventado === null && r.texto === t, `${motivo}: queda igual`);
}

console.log("\n── sin herramienta, no se tiran precios de memoria ──");
// Es lo que pasó: Max dijo "ya volvió a tener stock" y un precio, sin buscar nada.
const sinBuscar = filtrarPrecios("Sí, la alfombra para tu HB20 está disponible, sale $2.850.", []);
ok(sinBuscar.inventado === 2850, "sin resultados de herramienta, cualquier precio es inventado");
ok(!/2\.?850/.test(sinBuscar.texto), "no le llega el número al cliente");

// ── Un invento anterior NO se auto-autoriza ──────────────────────────────────
// Pasó en vivo: con el control ya puesto, Max seguía repitiendo el $2.850 en ESA charla,
// porque el número estaba escrito de antes y el propio control lo daba por bueno. Un
// precio de la charla vale solo si es un precio REAL del catálogo, tal cual.
console.log("\n── un precio inventado antes no se hereda ──");
const CHARLA_SUCIA = "Cliente: hola tenes para hb20 / Max: la alfombra bandeja rígida para tu HB20 está disponible, sale $2.850. / Cliente: tenes alfomrba para hb20 ?";
const repite = filtrarPrecios("Sí, tal como te comenté recién, tenemos la alfombra bandeja rígida negra para tu HB20 a $2.850.", [], CHARLA_SUCIA);
ok(repite.inventado === 2850, "no lo deja repetir solo porque ya lo había dicho");
ok(!/2\.?850/.test(repite.texto), `y no vuelve a salir → ${JSON.stringify(repite.texto.slice(0, 70))}`);
// Pero un precio REAL sí se puede repetir sin volver a buscar.
const CHARLA_OK = "Max: la alfombra bandeja 3D para tu HB20 sale $3.360.";
const bueno = filtrarPrecios("Sí, te confirmo: $3.360.", [], CHARLA_OK);
ok(bueno.inventado === null, "un precio REAL del catálogo sí se puede repetir");

console.log("\n── no puede confundir un precio con otro número ──");
for (const [t, motivo] of [
  ["El espesor es de 8 mm y la garantía es de 1 año.", "medidas y garantía"],
  ["Con transferencia tenés un 10% de descuento.", "un porcentaje"],
  ["Es para el modelo 2018 en adelante.", "un año de modelo"],
  ["Te lo llevás en 6 pagos.", "cuotas"],
  ["Quedás anotado, te aviso apenas entre.", "sin ningún número"],
]) {
  const r = filtrarPrecios(t, []);
  ok(r.inventado === null && r.texto === t, `${motivo}: no lo toma como precio`);
}

console.log("");
if (fallos.length) {
  console.log(`❌ ${pasaron} pasaron, ${fallos.length} fallaron\n`);
  fallos.forEach((f) => console.log("   ❌", f));
  process.exit(1);
}
console.log(`✅ TODO OK — ${pasaron} pasaron, 0 fallaron`);
