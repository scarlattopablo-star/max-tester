// Test de ALFOMBRAS QUE ESTÁN ENTRANDO (pedido de Pablo, 5 oct 2026): "todo lo que
// es alfombra y la gente consulte ya están entrando, así que para saber el día exacto
// de la entrega que le comunique a un asesor para que le diga al cliente".
// Una alfombra AGOTADA ya no recibe el "agotado, ¿te aviso cuando llegue?": se le dice
// que está entrando y va directo al asesor. Los demás productos agotados, igual que antes.
// Sin red y sin IA. Correr: node src/alfombras_entrando.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { ejecutarHerramienta, armarRespuesta } from "./cerebro.js";
import { AVISO_AGOTADO, AVISO_ALFOMBRA_ENTRANDO } from "./config.js";

let ok = 0;
async function testAsync(nombre, fn) { await fn(); ok++; console.log(`  ✓ ${nombre}`); }

actualizarCatalogo(
  [{ id: "MLU100", n: "Cubreasiento Fiat Strada Cuero Ecologico Negro", p: 9000, img: "https://http2.mlstatic.com/D_1-O.jpg" }],
  "test",
  [
    { id: "MLU200", n: "Alfombra Chevrolet Onix 2025 Bandeja Rigida 3d Negro", p: 3400, img: "https://http2.mlstatic.com/D_2-O.jpg" },
    { id: "MLU300", n: "Cubre Volante Chevrolet Onix Cuero Negro", p: 900, img: "https://http2.mlstatic.com/D_3-O.jpg" },
  ],
);

await testAsync("alfombra AGOTADA -> 'está entrando', sin '¿te aviso?', y se deriva sola", async () => {
  const ctx = { _ultimoUsuario: "tenes alfombra para onix 2025?", textoCharla: "alfombra onix 2025", _turno: { busco: false } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra onix 2025" }, ctx);
  assert.equal(r.agotado, true);          // sigue siendo un producto que existe
  assert.equal(r.entrando, true);
  assert.equal(r.textoAgotado, undefined); // ⛔ nada de "agotado, ¿te aviso?"
  assert.equal(r.avisoDisponibilidad, AVISO_ALFOMBRA_ENTRANDO);
  assert.equal(ctx._turno.alfombraEntrando, true);

  // Max no llama a derivar y encima escribe "agotada": se le saca y se deriva igual.
  const { texto, acciones } = armarRespuesta(
    "Justo la alfombra bandeja 3D para tu Onix. Está agotada por ahora, ¿querés que te avise?",
    [{ herramienta: "consultar_precio", input: {}, resultado: r }], ctx);
  assert.ok(!/agotad/i.test(texto));
  assert.ok(!/te avise/i.test(texto));
  assert.match(texto, /ya está entrando/);
  assert.match(texto, /día exacto/);
  assert.ok(acciones.some((a) => a.herramienta === "derivar_a_humano"));
});

await testAsync("si Max PREGUNTA por el asesor, la derivación sale igual (no espera el sí)", async () => {
  const ctx = { _ultimoUsuario: "alfombra onix 2025", textoCharla: "alfombra onix 2025", _turno: { busco: true } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra onix 2025" }, ctx);
  ctx._turno.texto = "¿Querés que te pase con un asesor para la fecha?";
  const d = await ejecutarHerramienta("derivar_a_humano", { motivo: "otro", resumen: "alfombra onix 2025 entrando" }, ctx);
  assert.notEqual(d?.ok, false);
  assert.equal(r.alfombraEntrando, true);
});

await testAsync("otro producto AGOTADO (cubre volante) -> sigue el aviso de siempre", async () => {
  const ctx = { _ultimoUsuario: "tenes cubre volante para onix?", textoCharla: "cubre volante onix", _turno: { busco: false } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "cubre volante onix" }, ctx);
  assert.equal(r.agotado, true);
  assert.equal(r.textoAgotado, AVISO_AGOTADO);
  assert.equal(r.entrando, undefined);
  assert.ok(!ctx._turno.alfombraEntrando);
});

console.log(`\n✅ ${ok} pruebas de ALFOMBRAS QUE ESTÁN ENTRANDO en verde`);
