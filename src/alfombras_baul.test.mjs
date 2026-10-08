// ALFOMBRA DE PISO Y DE BAÚL — tal cual están en Mercado Libre (pedido de Pablo, 8 oct
// 2026: "Max está ofreciendo con las alfombras de piso las del baúl, y no para todos es
// así"). Algunas publicaciones traen las dos (el título dice "+ Alfombra Bual") y la
// mayoría no. Los títulos de acá son REALES, copiados de las publicaciones.
// Sin red y sin IA. Correr: node src/alfombras_baul.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { piezaAlfombra, ejecutarHerramienta, buscarPrecio } from "./cerebro.js";

let ok = 0;
const test = (nombre, fn) => { fn(); ok++; console.log(`  ✓ ${nombre}`); };
async function testAsync(nombre, fn) { await fn(); ok++; console.log(`  ✓ ${nombre}`); }

test("piso + baúl solo cuando el título lo dice", () => {
  assert.equal(piezaAlfombra("Alfombra Hb20 Sedan 3d + Alfombra Bual 3d Negro"), "piso+baul");
  assert.equal(piezaAlfombra("Alfombra Byd Dolphin  Bandeja 3d + Alfombra Bual Bandeja 3d Negro"), "piso+baul");
});

test("la de piso sola NO trae la del baúl", () => {
  assert.equal(piezaAlfombra("Alfombra Volkswagen Nivus Bandeja 3d Negro"), "piso");
  assert.equal(piezaAlfombra("Alfombra Hyundai Tucson 2021+  Goma Negro"), "piso"); // "+" del año, no de otra pieza
  assert.equal(piezaAlfombra("Alfombra Seagull Bandeja 3d + Carcasa Espejo F Carbono Negro"), "piso");
});

test("la de baúl sola (con tilde, sin tilde y con la errata 'Bual')", () => {
  assert.equal(piezaAlfombra("Alfombra Baúl  Nivus  Bandeja 3d Negro"), "baul");
  assert.equal(piezaAlfombra("Alfombra Baul Onix Sedan Bandeja 3d Negro"), "baul");
  assert.equal(piezaAlfombra("Alfombra Bual Bandeja 3d Dongfeng Nammi Negro"), "baul");
  assert.equal(piezaAlfombra("Alfombra Jac Ytterby  Baul 3 D Rigida Negro"), "baul");
});

test("la de la caja y lo que no es alfombra", () => {
  assert.equal(piezaAlfombra("Alfombra De Caja Toyota Hilux ,max Resistencia, Tira Empuja Negro"), "caja");
  assert.equal(piezaAlfombra("Cubreasiento  Hilux Cuero Ecolgico 16-26 + Alfombra Bandeja Negro"), null);
});

actualizarCatalogo([
  { id: "MLU1", n: "Alfombra Volkswagen Nivus Bandeja 3d Negro", p: 3000, img: "https://http2.mlstatic.com/D_1-O.jpg" },
  { id: "MLU2", n: "Alfombra Baúl  Nivus  Bandeja 3d Negro", p: 2632, img: "https://http2.mlstatic.com/D_2-O.jpg" },
  { id: "MLU3", n: "Alfombra Hb20 Sedan 3d + Alfombra Bual 3d Negro", p: 5900, img: "https://http2.mlstatic.com/D_3-O.jpg" },
  { id: "MLU4", n: "Alfombra Baúl Hb20 Sedan Bandeja 3d Negro", p: 2672, img: "https://http2.mlstatic.com/D_4-O.jpg" },
], "test");

await testAsync("enviar_foto (Nivus): avisa que la de piso NO trae la del baúl", async () => {
  const r = await ejecutarHerramienta("enviar_foto", { producto: "alfombra nivus" }, { _ultimoUsuario: "alfombras para mi nivus" });
  assert.match(r.instruccion, /QUÉ TRAE CADA ALFOMBRA/);
  assert.match(r.instruccion, /Nivus Bandeja 3d Negro" → solo la del PISO, NO trae la del baúl/);
  assert.match(r.instruccion, /Baúl {2}Nivus[^"]*" → solo la del BAÚL/);
  assert.match(r.instruccion, /NO sumes/);
});

await testAsync("consultar_precio (HB20 sedán): la que trae las dos lo dice", async () => {
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra hb20 sedan" }, { _ultimoUsuario: "precio alfombra hb20 sedan" });
  assert.match(r.instruccion, /Bual 3d Negro" → piso \+ baúl/);
});

await testAsync("cubreasientos: no se mete la nota de alfombras", async () => {
  actualizarCatalogo([{ id: "MLU9", n: "Cubreasiento Toyota Hilux Cuero Ecologico Negro", p: 18000, img: "https://http2.mlstatic.com/D_9-O.jpg" }], "test");
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "cubreasiento hilux" }, { _ultimoUsuario: "cubreasiento hilux" });
  assert.ok(!/QUÉ TRAE CADA ALFOMBRA/.test(r.instruccion || ""));
});

test("pidió la de baúl: entra también la que trae piso + 'Bual'", () => {
  actualizarCatalogo([
    { id: "MLU3", n: "Alfombra Hb20 Sedan 3d + Alfombra Bual 3d Negro", p: 5900 },
    { id: "MLU4", n: "Alfombra Baúl Hb20 Sedan Bandeja 3d Negro", p: 2672 },
    { id: "MLU5", n: "Alfombra Hb20 Sedan Bandeja 3d Negro", p: 3360 },
  ], "test");
  assert.deepEqual(buscarPrecio("alfombra baul hb20 sedan").map((x) => x.id).sort(), ["MLU3", "MLU4"]);
});

console.log(`\n${ok} OK`);
