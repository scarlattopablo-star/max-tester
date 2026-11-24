// Alfombras del BYD Yuan Pro: SOLO para la eléctrica (Rodrigo, 24 nov 2026):
// "ALFOMBRA BYD YUAN PRO, NO SIRVE PARA LA HIBRIDA DMI. SOLO ELECTRRICA".
//  1. Se cotiza/muestra una alfombra del Yuan Pro -> va la aclaración fija (una vez).
//  2. El cliente dijo que es la híbrida (DM-i) -> no hay alfombra para él, texto fijo.
//  3. Híbrida pero pregunta cubreasiento -> se cotiza normal, sin aclaración.
// Sin red y sin IA. Correr: node src/alfombra_yuan_pro.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { ejecutarHerramienta, armarRespuesta } from "./cerebro.js";
import { AVISO_ALFOMBRA_YUAN_PRO, AVISO_ALFOMBRA_YUAN_PRO_HIBRIDA } from "./config.js";

let ok = 0;
async function t(nombre, fn) { await fn(); ok++; console.log(`  ✓ ${nombre}`); }

actualizarCatalogo(
  [
    { id: "MLU709387702", n: "Alfombra  Byd Yuan Pro Bandeja Rigida 3d Negro", p: 3900, img: "https://http2.mlstatic.com/D_1-O.jpg" },
    { id: "MLU703146446", n: "Cubreasiento Byd Yuan Pro Cuero Ecologico Impermeable Negro", p: 11900, img: "https://http2.mlstatic.com/D_2-O.jpg" },
    { id: "MLU696679948", n: "Alfombra Baul Byd Yuan Plus Bandeja Rigida Negro", p: 2900, img: "https://http2.mlstatic.com/D_3-O.jpg" },
  ],
  "test",
  [],
);

await t("alfombra Yuan Pro cotizada -> aclaración de solo eléctrica", async () => {
  const ctx = { _ultimoUsuario: "tenes alfombra para byd yuan pro?", textoCharla: "alfombra byd yuan pro", _turno: { busco: false } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra byd yuan pro" }, ctx);
  assert.equal(r.encontrado, true);
  const { texto } = armarRespuesta("Sí, la bandeja 3D sale $3.900.", [{ herramienta: "consultar_precio", input: {}, resultado: r }], ctx);
  assert.ok(texto.includes(AVISO_ALFOMBRA_YUAN_PRO), texto);
});

await t("con foto también va la aclaración, y no se repite si ya se dijo", async () => {
  const ctx = { _ultimoUsuario: "mandame foto de la alfombra yuan pro", textoCharla: "alfombra yuan pro", _turno: { busco: false } };
  const r = await ejecutarHerramienta("enviar_foto", { producto: "alfombra byd yuan pro" }, ctx);
  assert.equal(r.ok, true);
  const acc = [{ herramienta: "enviar_foto", input: {}, resultado: r }];
  assert.ok(armarRespuesta("Te paso la foto.", acc, ctx).texto.includes(AVISO_ALFOMBRA_YUAN_PRO));
  const ctx2 = { ...ctx, _turno: { busco: false }, _recientesMax: AVISO_ALFOMBRA_YUAN_PRO };
  assert.ok(!armarRespuesta("Te paso la foto.", acc, ctx2).texto.includes(AVISO_ALFOMBRA_YUAN_PRO));
});

await t("Yuan Pro HÍBRIDA (DM-i) -> no hay alfombra, texto fijo, sin precio ni asesor", async () => {
  const ctx = { _ultimoUsuario: "alfombra para yuan pro dm-i", textoCharla: "tengo una yuan pro hibrida. alfombra para yuan pro dm-i", _turno: { busco: false } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra byd yuan pro" }, ctx);
  assert.equal(r.encontrado, false);
  assert.equal(r.textoSinAlfombra, AVISO_ALFOMBRA_YUAN_PRO_HIBRIDA);
  const { texto, acciones } = armarRespuesta("Uh, para esa todavía no. ¿Querés que te pase con un asesor?", [{ herramienta: "consultar_precio", input: {}, resultado: r }], ctx);
  assert.ok(texto.includes(AVISO_ALFOMBRA_YUAN_PRO_HIBRIDA), texto);
  assert.ok(!/asesor/i.test(texto.replace(AVISO_ALFOMBRA_YUAN_PRO_HIBRIDA, "")), texto);
  assert.ok(!acciones.some((a) => a.herramienta === "derivar_a_humano"));
  const f = await ejecutarHerramienta("enviar_foto", { producto: "alfombra byd yuan pro" }, { ...ctx, _turno: { busco: false } });
  assert.equal(f.ok, false);
  assert.equal(f.textoSinAlfombra, AVISO_ALFOMBRA_YUAN_PRO_HIBRIDA);
});

await t("híbrida pidiendo CUBREASIENTO -> se cotiza normal, sin aclaración de alfombra", async () => {
  const ctx = { _ultimoUsuario: "cubreasiento para yuan pro hibrida", textoCharla: "cubreasiento yuan pro hibrida", _turno: { busco: false } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "cubreasiento byd yuan pro" }, ctx);
  assert.equal(r.encontrado, true);
  assert.ok(r.resultados.every((x) => /cubreasiento/i.test(x.nombre)));
  const { texto } = armarRespuesta("Sale $11.900.", [{ herramienta: "consultar_precio", input: {}, resultado: r }], ctx);
  assert.ok(!texto.includes(AVISO_ALFOMBRA_YUAN_PRO));
});

console.log(`\n${ok} tests OK`);
