// "ALFOMBRA DE PISO" (producción, 10 oct 2026): Max buscó "alfombra piso Oroch doble
// cabina" y la búsqueda dio cero, porque la de piso está publicada como "Alfombra Oroch
// Bandeja Rigida" (sin la palabra "piso"). Le dijo al cliente que para su doble cabina
// no había. Con el catálogo real, "alfombra piso <auto>" daba cero en 23 de 24 modelos.
// Ahora "piso" no se exige en el título: se usa para sacar la de caja y la de baúl.
// Sin red y sin IA. Correr: node src/alfombra_piso.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { buscarPrecio } from "./cerebro.js";

let ok = 0;
const test = (nombre, fn) => { fn(); ok++; console.log(`  ✓ ${nombre}`); };

actualizarCatalogo([
  { id: "MLU1", n: "Alfombra De Caja Renault Oroch, Max Resistencia,tira Y Emp Negro", p: 3325, img: "https://x/1.jpg" },
  { id: "MLU2", n: "Alfombra Oroch Bandeja Rigida  Maxima Resistencia Negro", p: 3790, img: "https://x/2.jpg" },
  { id: "MLU3", n: "Alfombra Baúl Hb20 Sedan Bandeja 3d Negro", p: 2625, img: "https://x/3.jpg" },
  { id: "MLU4", n: "Alfombra Vw Nivus Bandeja 3d + Alfombra Baul Negro", p: 5200, img: "https://x/4.jpg" },
  { id: "MLU5", n: "Alfombra Baul Vw Nivus 3d Negro", p: 2400, img: "https://x/5.jpg" },
], "test");
const nombres = (q) => buscarPrecio(q).map((r) => r.nombre);

test("el caso real: 'alfombra piso Oroch doble cabina' encuentra la bandeja", () => {
  assert.deepEqual(nombres("alfombra piso Oroch doble cabina"), ["Alfombra Oroch Bandeja Rigida  Maxima Resistencia Negro"]);
});

test("la de piso no trae la de caja", () => {
  assert.ok(!nombres("alfombra de piso oroch").some((n) => /caja/i.test(n)));
});

test("sin decir la pieza, salen las dos como siempre", () => {
  assert.equal(nombres("alfombra oroch doble cabina").length, 2);
});

test("si de ese auto solo hay la de baúl, de piso no hay (no se le ofrece la de baúl)", () => {
  assert.deepEqual(nombres("alfombra piso hb20 sedan"), []);
});

test("la que trae piso + baúl cuenta como de piso", () => {
  assert.deepEqual(nombres("alfombra piso nivus"), ["Alfombra Vw Nivus Bandeja 3d + Alfombra Baul Negro"]);
});

test("piso y baúl juntos: no se filtra por pieza", () => {
  assert.equal(nombres("alfombra piso y baul nivus").length, 2);
});

console.log(`\n${ok} pruebas OK`);
