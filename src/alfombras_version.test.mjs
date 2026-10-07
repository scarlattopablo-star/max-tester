// ALFOMBRAS 3D / 4D / 5D — tal cual están en Mercado Libre (pedido de Rodrigo, 7 oct
// 2026). Son productos distintos con precio distinto, y hay modelos con más de una:
// el Dongfeng Vigo tiene la 3D a $4.900 y la 4D a $3.900. Antes, el que pedía la 3D
// recibía también la 4D, y la 4D escrita "4 D" (así está la del Swift) no aparecía.
// Sin red y sin IA. Correr: node src/alfombras_version.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { buscarPrecio } from "./cerebro.js";

let ok = 0;
const test = (nombre, fn) => { fn(); ok++; console.log(`  ✓ ${nombre}`); };

actualizarCatalogo([
  { id: "MLU1", n: "Alfombra Dongfeng Vigo Bandeja 3d Antiderrame Negro", p: 4900 },
  { id: "MLU2", n: "Alfombra  Dongfeng Vigo  Bandeja 4d Antiderrame Negro", p: 3900 },
  { id: "MLU3", n: "Alfombra Bandeja  Suzuki Swift 2005-2011 4 D Negro", p: 2500 },
  { id: "MLU4", n: "Alfombra Geely Ex2 Bandeja 3d Premium Para Auto Negro", p: 4300 },
  { id: "MLU5", n: "Alfombra Bandeja 5d  Geely Ex2 Cubre El Socalo Negro", p: 4900 },
  { id: "MLU6", n: "Alfombra Montana Bandeja Negro", p: 3612 },
], "test");

const ids = (q) => buscarPrecio(q).map((r) => r.id).sort();

test("sin versión: muestra TODAS las del modelo, cada una con su precio", () => {
  const r = buscarPrecio("alfombra dongfeng vigo");
  assert.deepEqual(r.map((x) => x.id).sort(), ["MLU1", "MLU2"]);
  assert.equal(r.find((x) => x.id === "MLU2").precio, 3900);
});

test("pidió la 3D: no le mezcla la 4D", () => assert.deepEqual(ids("alfombra 3d dongfeng vigo"), ["MLU1"]));
test("pidió la 4D: solo la 4D", () => assert.deepEqual(ids("alfombra 4d vigo"), ["MLU2"]));
test("'4 D' separado = 4D (consulta y título)", () => {
  assert.deepEqual(ids("alfombra 4 d vigo"), ["MLU2"]);
  assert.deepEqual(ids("alfombra suzuki swift 4d"), ["MLU3"]);
});
test("pidió la 5D: no le mezcla la 3D", () => assert.deepEqual(ids("alfombra geely ex2 5d"), ["MLU5"]));
test("pidió una versión que no hay: muestra la que hay (el nombre dice cuál es)", () => {
  assert.deepEqual(ids("alfombra 5d vigo"), ["MLU1", "MLU2"]);
});
test("el título sin versión no se pierde ('Montana Bandeja' es la rígida)", () => {
  assert.deepEqual(ids("alfombra 3d montana"), ["MLU6"]);
});

console.log(`\n${ok} OK`);
