// Test de la DISPONIBILIDAD A PEDIDO (pedido de Pablo, 2 sep 2026: "activamos
// artículos que recién están disponibles a los 21 días; Max los vendía como si
// estuvieran en el local"). Sin red y sin IA.
// Correr: node src/disponibilidad.test.mjs   (o npm test, que corre todos)
//
// ⚠️ CATALOGO_SIN_DISCO antes de los imports: si no, el catálogo de prueba pisa
// el snapshot real de src/productos_ml.json.
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo, infoCatalogo } from "./catalogo_vivo.js";
import { diasDeDisponibilidad } from "./sync_ml.js";
import { demoraDeProductos, demoraDelProducto, ejecutarHerramienta, armarRespuesta } from "./cerebro.js";
import { AVISO_DISPONIBILIDAD } from "./config.js";

let ok = 0;
function test(nombre, fn) { fn(); ok++; console.log(`  ✓ ${nombre}`); }
async function testAsync(nombre, fn) { await fn(); ok++; console.log(`  ✓ ${nombre}`); }

// Catálogo de prueba:
//  · el cubreasiento de la Hilux es A PEDIDO (21 días) — es el caso que reportó Pablo;
//  · las alfombras de la Nivus están MEZCLADAS: la de piso se lleva en el momento y
//    la de baúl es a pedido (ahí un aviso único mentiría sobre una de las dos).
actualizarCatalogo([
  { id: "MLU111", n: "Cubreasiento Toyota Hilux Cuero Ecologico Negro", p: 18000, img: "https://http2.mlstatic.com/D_1-O.jpg", d: 21 },
  { id: "MLU222", n: "Alfombra Volkswagen Nivus Bandeja 3d Negro", p: 3000, img: "https://http2.mlstatic.com/D_2-O.jpg" },
  { id: "MLU333", n: "Alfombra Volkswagen Nivus Baul Bandeja 3d Negro", p: 2500, img: "https://http2.mlstatic.com/D_3-O.jpg", d: 21 },
], "test");

// ─── 1) Leer el plazo de la publicación de Mercado Libre ───────────────
// El plazo viaja en sale_terms con id MANUFACTURING_TIME. ML lo manda a veces
// estructurado, a veces solo como texto, y a veces en otra unidad.
test("sale_terms estructurado — 21 días", () => {
  const it = { id: "MLU1", sale_terms: [{ id: "MANUFACTURING_TIME", value_name: "21 días", value_struct: { number: 21, unit: "días" } }] };
  assert.equal(diasDeDisponibilidad(it), 21);
});

test("sale_terms solo con texto — '21 días'", () => {
  assert.equal(diasDeDisponibilidad({ id: "MLU1", sale_terms: [{ id: "MANUFACTURING_TIME", value_name: "21 días" }] }), 21);
});

test("'3 días hábiles' son 3 días", () => {
  assert.equal(diasDeDisponibilidad({ id: "MLU1", sale_terms: [{ id: "MANUFACTURING_TIME", value_name: "3 días hábiles" }] }), 3);
});

test("en horas se redondea para arriba (48 h = 2 días, 12 h = 1)", () => {
  const h = (n) => diasDeDisponibilidad({ id: "MLU1", sale_terms: [{ id: "MANUFACTURING_TIME", value_struct: { number: n, unit: "horas" } }] });
  assert.equal(h(48), 2);
  assert.equal(h(12), 1); // nunca 0: 0 sería decirle al cliente que se lo lleva
});

test("semanas y meses se pasan a días", () => {
  const u = (n, unit) => diasDeDisponibilidad({ id: "MLU1", sale_terms: [{ id: "MANUFACTURING_TIME", value_struct: { number: n, unit } }] });
  assert.equal(u(2, "semanas"), 14);
  assert.equal(u(1, "meses"), 30);
});

test("también se lee desde attributes (algunas publicaciones lo traen ahí)", () => {
  assert.equal(diasDeDisponibilidad({ id: "MLU1", attributes: [{ id: "MANUFACTURING_TIME", value_name: "21 días" }] }), 21);
});

test("ENTREGA INMEDIATA — sin sale_terms, o declarando que está listo, es 0", () => {
  assert.equal(diasDeDisponibilidad({ id: "MLU1" }), 0);
  assert.equal(diasDeDisponibilidad({ id: "MLU1", sale_terms: [{ id: "WARRANTY_TIME", value_name: "6 meses" }] }), 0);
  assert.equal(diasDeDisponibilidad({ id: "MLU1", sale_terms: [{ id: "MANUFACTURING_TIME", value_name: "No, lo tengo listo para enviar" }] }), 0);
});

// ─── 2) El catálogo sabe cuántas son a pedido (sale en /api/estado) ────
test("infoCatalogo cuenta las publicaciones a pedido", () => {
  assert.equal(infoCatalogo().aPedido, 2);
});

// ─── 3) Agregado: cuándo alcanza el aviso oficial y cuándo hay que detallar ──
test("todo a pedido con el mismo plazo -> aviso oficial", () => {
  const d = demoraDeProductos([{ nombre: "A", demora_dias: 21 }, { nombre: "B", demora_dias: 21 }]);
  assert.deepEqual({ dias: d.dias, todos: d.todos }, { dias: 21, todos: true });
});

test("mezcla de inmediato y a pedido -> NO es aviso único", () => {
  const d = demoraDeProductos([{ nombre: "A", demora_dias: 0 }, { nombre: "B", demora_dias: 21 }]);
  assert.equal(d.todos, false);
  assert.deepEqual(d.productos, [{ nombre: "B", dias: 21 }]);
});

test("plazos distintos -> tampoco (un texto único mentiría sobre uno)", () => {
  assert.equal(demoraDeProductos([{ nombre: "A", demora_dias: 21 }, { nombre: "B", demora_dias: 7 }]).todos, false);
});

test("todo de entrega inmediata -> null (no se dice nada)", () => {
  assert.equal(demoraDeProductos([{ nombre: "A", demora_dias: 0 }]), null);
});

// ─── 4) La cotización avisa la demora ──────────────────────────────────
await testAsync("consultar_precio de un producto A PEDIDO -> aviso + nota interna", async () => {
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "cubreasiento hilux" }, { _ultimoUsuario: "cuanto sale el cubreasiento para mi hilux" });
  assert.equal(r.encontrado, true);
  assert.equal(r.resultados[0].demora_dias, 21);
  assert.equal(r.avisoDisponibilidad, AVISO_DISPONIBILIDAD(21));
  assert.match(r.instruccion, /A PEDIDO/);
  // ⛔ Un producto a pedido NO es un producto agotado: se vende hoy.
  assert.match(r.instruccion, /NO está agotado/);
  assert.equal(r.agotado, undefined);
});

await testAsync("consultar_precio MEZCLADO -> sin texto único, con el detalle por producto", async () => {
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra nivus" }, { _ultimoUsuario: "precio de alfombras para mi nivus" });
  assert.equal(r.encontrado, true);
  assert.equal(r.avisoDisponibilidad, undefined);
  assert.match(r.instruccion, /Baul[\s\S]*21 días/);
});

await testAsync("producto de ENTREGA INMEDIATA -> no se dice nada de plazos", async () => {
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra bandeja 3d nivus piso" }, { _ultimoUsuario: "precio alfombra de piso nivus" });
  const soloInmediatas = (r.resultados || []).every((x) => !x.demora_dias);
  if (soloInmediatas) {
    assert.equal(r.avisoDisponibilidad, undefined);
    assert.equal(r.demora, undefined);
  }
});

// ─── 5) Las fotos lo dicen en el pie (mandar la foto ES cotizar) ───────
await testAsync("enviar_foto -> el pie de la foto a pedido lo aclara", async () => {
  const r = await ejecutarHerramienta("enviar_foto", { producto: "alfombra nivus" }, { _ultimoUsuario: "mandame fotos de alfombras para el nivus" });
  const acciones = [{ herramienta: "enviar_foto", input: {}, resultado: r }];
  const { imagenesEnviar } = armarRespuesta("Te comparto las opciones para tu Nivus:", acciones, { _ultimoUsuario: "alfombras para mi nivus", textoCharla: "alfombras para mi nivus" });
  const baul = imagenesEnviar.find((f) => /baul/i.test(f.caption));
  const piso = imagenesEnviar.find((f) => !/baul/i.test(f.caption));
  assert.match(baul.caption, /a pedido: disponible en 21 días/);
  assert.ok(!/a pedido/.test(piso.caption)); // la que está en el local, sin ruido
});

// ─── 6) El mensaje final lleva el texto oficial una sola vez ───────────
await testAsync("el aviso oficial se agrega al mensaje y no se duplica", async () => {
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "cubreasiento hilux" }, { _ultimoUsuario: "cuanto sale el cubreasiento para mi hilux" });
  const acciones = [{ herramienta: "consultar_precio", input: {}, resultado: r }, { herramienta: "consultar_precio", input: {}, resultado: r }];
  const { texto } = armarRespuesta("El cubreasiento para tu Hilux sale $ 18.000, sin colocación.", acciones, { _ultimoUsuario: "cubreasiento hilux", textoCharla: "cubreasiento para mi hilux" });
  assert.equal(texto.split("Sobre la DISPONIBILIDAD").length - 1, 1);
  assert.match(texto, /21 días/);
  assert.match(texto, /\$ 18\.000/); // el precio que pidió el cliente NO se pierde
});

await testAsync("si Max escribe su propio plazo, se queda el oficial (y el precio no se pierde)", async () => {
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "cubreasiento hilux" }, { _ultimoUsuario: "cuanto sale el cubreasiento para mi hilux" });
  const acciones = [{ herramienta: "consultar_precio", input: {}, resultado: r }];
  const { texto } = armarRespuesta("El cubreasiento para tu Hilux sale $ 18.000. Se entrega en 21 días.", acciones, { _ultimoUsuario: "cubreasiento hilux", textoCharla: "cubreasiento para mi hilux" });
  assert.match(texto, /\$ 18\.000/);
  assert.ok(!/Se entrega en 21 días\./.test(texto));
  assert.match(texto, /Sobre la DISPONIBILIDAD/);
});

// ─── 7) Al CERRAR la venta se vuelve a decir ───────────────────────────
test("demoraDelProducto reconoce el título del catálogo (exacto o dentro del texto)", () => {
  assert.equal(demoraDelProducto("Cubreasiento Toyota Hilux Cuero Ecologico Negro"), 21);
  assert.equal(demoraDelProducto("1 x Cubreasiento Toyota Hilux Cuero Ecologico Negro (negro)"), 21);
  assert.equal(demoraDelProducto("Alfombra Volkswagen Nivus Bandeja 3d Negro"), 0);
  assert.equal(demoraDelProducto("una funda cualquiera"), 0);
});

await testAsync("tomar_pedido de un artículo a pedido -> el aviso viaja con el cierre", async () => {
  const r = await ejecutarHerramienta("tomar_pedido", {
    producto: "Cubreasiento Toyota Hilux Cuero Ecologico Negro", cantidad: 1,
    nombre: "Juan", telefono: "099111222", entrega: "retira en el local",
  }, {});
  assert.equal(r.avisoDisponibilidad, AVISO_DISPONIBILIDAD(21));
  assert.match(r.instruccion, /A PEDIDO/);
});

await testAsync("tomar_pedido de un artículo del local -> sin aviso", async () => {
  const r = await ejecutarHerramienta("tomar_pedido", {
    producto: "Alfombra Volkswagen Nivus Bandeja 3d Negro", cantidad: 1,
    nombre: "Juan", telefono: "099111222", entrega: "retira en el local",
  }, {});
  assert.equal(r.avisoDisponibilidad, undefined);
});

console.log(`\n✅ ${ok} pruebas de DISPONIBILIDAD en verde`);
