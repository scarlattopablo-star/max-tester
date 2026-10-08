// ALFOMBRA DE PISO Y DE BAÚL — tal cual están en Mercado Libre (pedido de Pablo, 8 oct
// 2026: "Max está ofreciendo con las alfombras de piso las del baúl, y no para todos es
// así"). Algunas publicaciones traen las dos (el título dice "+ Alfombra Bual") y la
// mayoría no. Los títulos de acá son REALES, copiados de las publicaciones.
// Sin red y sin IA. Correr: node src/alfombras_baul.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { piezaAlfombra, ejecutarHerramienta, buscarPrecio, filtrarJuegoAlfombras, notaPiezasMostradas, eleccionAmbigua } from "./cerebro.js";

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

// ─── Lo que pasó probando producción el 8 oct 2026 ─────────────────────
const TUCSON = [{ herramienta: "enviar_foto", resultado: { ok: true, fotos: [{ nombre: "Alfombra Hyundai Tucson 2021+  Goma Negro" }] } }];

test("Tucson (solo piso): se cae el 'juego completo' y queda la verdad", () => {
  const r = filtrarJuegoAlfombras("La de piso que te mostré es solo de piso. ¿Te interesa llevar el juego completo?", [], "alfombras para Hyundai Tucson 2022");
  assert.equal(r, "La de piso que te mostré es solo de piso.");
});

test("se cae 'viene con la del baúl' y respeta los párrafos", () => {
  const r = filtrarJuegoAlfombras("Sí, tenemos para tu Tucson.\n\nLa alfombra viene con la del baúl. Sale $2.700.\n\n¿La querés?", TUCSON, "alfombra tucson");
  assert.equal(r, "Sí, tenemos para tu Tucson.\n\nSale $2.700.\n\n¿La querés?");
});

test("la que lo NIEGA se deja", () => {
  const t = "No, la de piso y la de baúl son publicaciones aparte, cada una con su precio.";
  assert.equal(filtrarJuegoAlfombras(t, TUCSON, "alfombra tucson"), t);
});

test("si hay una que trae las dos (en el turno o ya mostrada), no se toca", () => {
  const t = "Esta viene con la del baúl, sale $5.900.";
  const hb20 = [{ herramienta: "enviar_foto", resultado: { ok: true, fotos: [{ nombre: "Alfombra Hb20 Sedan 3d + Alfombra Bual 3d Negro" }] } }];
  assert.equal(filtrarJuegoAlfombras(t, hb20, "alfombra hb20"), t);
  const charla = "[Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alombra Onix Sedan Bandeja 3d+ Baul 3d Negro - $ 5.900]";
  assert.equal(filtrarJuegoAlfombras(t, [], charla), t);
});

test("cubreasientos: 'juego completo' no se toca", () => {
  const t = "El juego completo de cubreasientos para tu Polo sale $2.990.";
  assert.equal(filtrarJuegoAlfombras(t, [], "cubreasiento polo"), t);
});

await testAsync("solo de baúl: la nota le prohíbe decir que hay de piso", async () => {
  actualizarCatalogo([{ id: "MLU4", n: "Alfombra Baúl Hb20 Sedan Bandeja 3d Negro", p: 2625, img: "https://http2.mlstatic.com/D_4-O.jpg" }], "test");
  const r = await ejecutarHerramienta("enviar_foto", { producto: "alfombra hb20 sedan" }, { _ultimoUsuario: "alfombras para HB20 sedán" });
  assert.match(r.instruccion, /SOLO hay alfombra de BAÚL/);
});

// ─── La repregunta, contestada de memoria (sin herramienta) ────────────
const nota = (caps, resp = "Te comparto las opciones.") =>
  `${resp}\u2063[Contexto interno — opciones que le mostré al cliente con foto, numeradas: ${caps.map((c, i) => `${i + 1}) ${c}`).join("; ")}.${notaPiezasMostradas(caps.map((c) => c.replace(/\s+-\s+\$.*$/, "")))} Si el cliente elige un número ("la 1", "el 2", "quiero la primera"), corresponde a ESTA lista; NO vuelvas a mostrar las opciones: avanzá con la que eligió.]`;

test("la nota del historial dice qué trae cada una y qué pieza no hay", () => {
  const n = nota(["Alfombra Hyundai Tucson 2021+  Goma Negro - $ 2.700"]);
  assert.match(n, /opción 1: solo la del PISO/);
  assert.match(n, /NO hay alfombra de baúl/);
});

test("Tucson, repregunta: se cae 'la del baúl también la tenemos'", () => {
  const charla = `alfombras para Hyundai Tucson 2022 ${nota(["Alfombra Hyundai Tucson 2021+  Goma Negro - $ 2.700"])} y trae la del baul tambien?`;
  const r = filtrarJuegoAlfombras("No, esa es solo la alfombra de piso. La del baúl es aparte y también la tenemos disponible para tu Tucson. ¿Te muestro la de baúl también, o te va bien solo con la de piso?", [], charla);
  assert.equal(r, "No, esa es solo la alfombra de piso.");
});

test("Onix hatch (solo baúl), repregunta: se cae 'para el piso tenemos opciones'", () => {
  const charla = `alfombras onix hatch ${nota(["Alfombra Baul Onix Hatch Engomadas 100 % Impermeables Negro - $ 1.890", "Alfombra Baul Onix Hatch Bandeja 3d Negro - $ 2.800"])} la de piso viene con la del baul?`;
  const r = filtrarJuegoAlfombras("No, la alfombra de piso y la del baúl son publicaciones separadas, cada una con su precio. Para el piso del Onix Hatch tenemos opciones también.", [], charla);
  assert.equal(r, "No, la alfombra de piso y la del baúl son publicaciones separadas, cada una con su precio.");
});

test("decir que NO hay la otra pieza se deja", () => {
  const charla = `alfombras hb20 sedan ${nota(["Alfombra Baúl Hb20 Sedan Bandeja 3d Negro - $ 2.625"])}`;
  const t = "Para el piso del HB20 sedán estamos sin stock por ahora.";
  assert.equal(filtrarJuegoAlfombras(t, [], charla), t);
});

test("la nota nueva no rompe la elección por número", () => {
  const charla = nota(["Alfombra Baul Onix Hatch Engomadas 100 % Impermeables Negro - $ 1.890", "Alfombra Baul Onix Hatch Bandeja 3d Negro - $ 2.800"]);
  assert.equal(eleccionAmbigua("quiero la 2", charla).ambigua, false);
});

console.log(`\n${ok} OK`);
