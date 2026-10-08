// Arranque: las herramientas esperan la PRIMERA sync con ML antes de mirar el
// catálogo (8 oct 2026: después de cada deploy Max ofrecía publicaciones pausadas
// y precios de agosto, los del snapshot del repo). Sin red y sin IA.
// Correr: node src/catalogo_fresco.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo, iniciarEsperaSync, marcarCatalogoFresco, esperarCatalogoFresco } from "./catalogo_vivo.js";
import { ejecutarHerramienta } from "./cerebro.js";

let ok = 0;
async function test(nombre, fn) { await fn(); ok++; console.log(`  ✓ ${nombre}`); }

await test("sin sync programada no se espera nada", async () => {
  const t0 = Date.now();
  assert.equal(await esperarCatalogoFresco(5000), true);
  assert.ok(Date.now() - t0 < 50);
});

await test("con la primera sync pendiente, la herramienta ve el catálogo NUEVO", async () => {
  actualizarCatalogo([{ id: "MLU1", n: "Alfombra Hb20 Sedan 3d + Alfombra Bual 3d Negro", p: 5900, img: "https://x/1.jpg" }], "snapshot");
  iniciarEsperaSync(); // arrancó: snapshot viejo en memoria, sync en curso
  const pedido = ejecutarHerramienta("consultar_precio", { modelo: "alfombra hb20 sedan" }, { _ultimoUsuario: "alfombra hb20 sedan", dichoPorElCliente: "alfombra hb20 sedan" });
  setTimeout(() => actualizarCatalogo([{ id: "MLU2", n: "Alfombra Baúl Hb20 Sedan Bandeja 3d Negro", p: 2625, img: "https://x/2.jpg" }], "api-ml"), 30);
  const r = await pedido;
  assert.deepEqual(r.resultados.map((x) => `${x.nombre} ${x.precio}`), ["Alfombra Baúl Hb20 Sedan Bandeja 3d Negro 2625"]);
});

await test("si la sync no llega, se sigue igual al vencer la espera", async () => {
  iniciarEsperaSync();
  assert.equal(await esperarCatalogoFresco(30), false);
  marcarCatalogoFresco();
  assert.equal(await esperarCatalogoFresco(30), true);
});

console.log(`\n${ok} OK`);
