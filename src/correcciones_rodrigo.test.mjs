// Correcciones de Rodrigo (14 oct 2026) — reemplaza al test de "ALFOMBRAS QUE ESTÁN
// ENTRANDO" (5 oct), que Rodrigo pidió sacar: "el bot no debe decir ni insinuar que
// están ingresando".
//  1. Alfombra que no tenemos para ese modelo -> "De momento no contamos con
//     alfombras disponibles para ese modelo..." + teléfono. Sin asesor ni aviso.
//  2. Alfombra AGOTADA (existe en ML) -> no hay disponibilidad + ofrece el aviso, sin
//     "esperamos que reingrese". Antes se chequea el stock en vivo de ML.
//  3. Material exclusivo (= cuero Sport) después del eco cuero, una vez por charla.
//  4. Colores: UNA sola imagen con los 5 colores.
//  5. Demora: al pasar a un asesor se deja el teléfono.
// Sin red y sin IA. Correr: node src/correcciones_rodrigo.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { ejecutarHerramienta, armarRespuesta } from "./cerebro.js";
import {
  AVISO_AGOTADO, AVISO_AGOTADO_ALFOMBRA, AVISO_ALFOMBRA_NO_DISPONIBLE, AVISO_DEMORA,
  TEXTO_MATERIAL_EXCLUSIVO, MUESTRA_COLORES, CUBREASIENTOS, TELEFONO_CONSULTAS,
} from "./config.js";

let ok = 0;
async function testAsync(nombre, fn) { await fn(); ok++; console.log(`  ✓ ${nombre}`); }

function catalogoBase() {
  actualizarCatalogo(
    [
      { id: "MLU100", n: "Cubreasiento Fiat Strada Cuero Ecologico Negro", p: 9000, img: "https://http2.mlstatic.com/D_1-O.jpg" },
      { id: "MLU400", n: "Alfombra Fiat Strada Bandeja Rigida 3d Negro", p: 3900, img: "https://http2.mlstatic.com/D_4-O.jpg" },
    ],
    "test",
    [
      { id: "MLU200", n: "Alfombra Chevrolet Onix 2025 Bandeja Rigida 3d Negro", p: 3400, img: "https://http2.mlstatic.com/D_2-O.jpg" },
      { id: "MLU300", n: "Cubre Volante Chevrolet Onix Cuero Negro", p: 900, img: "https://http2.mlstatic.com/D_3-O.jpg" },
    ],
  );
}
catalogoBase();

// ─── 1. Alfombra que NO tenemos para ese modelo ───
await testAsync("alfombra sin publicación -> texto oficial con teléfono, sin promesa ni asesor", async () => {
  const ctx = { _ultimoUsuario: "tenes alfombra para peugeot 3008?", textoCharla: "alfombra peugeot 3008", _turno: { busco: false } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra peugeot 3008" }, ctx);
  assert.equal(r.agotado, false);
  assert.equal(r.textoSinAlfombra, AVISO_ALFOMBRA_NO_DISPONIBLE);
  assert.match(AVISO_ALFOMBRA_NO_DISPONIBLE, new RegExp(TELEFONO_CONSULTAS));

  // Max escribe su versión con promesa y ofrece asesor: se le cae y queda el texto oficial.
  const { texto, acciones } = armarRespuesta(
    "Uh, para la 3008 todavía no. Están ingresando la semana que viene. ¿Querés que te pase con un asesor?",
    [{ herramienta: "consultar_precio", input: {}, resultado: r }], ctx);
  assert.ok(texto.includes(AVISO_ALFOMBRA_NO_DISPONIBLE));
  assert.ok(!/ingresando|semana que viene|asesor/i.test(texto));
  assert.ok(!acciones.some((a) => a.herramienta === "derivar_a_humano"));
});

// ─── 2. Alfombra AGOTADA ───
await testAsync("alfombra AGOTADA -> sin 'está entrando' y ofrece el aviso sin prometer reingreso", async () => {
  const ctx = { _ultimoUsuario: "tenes alfombra para onix 2025?", textoCharla: "alfombra onix 2025", _turno: { busco: false },
    _stockEnVivo: async () => 0 };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra onix 2025" }, ctx);
  assert.equal(r.agotado, true);
  assert.equal(r.entrando, undefined);
  assert.equal(r.textoAgotado, AVISO_AGOTADO_ALFOMBRA);
  assert.ok(!ctx._turno.alfombraEntrando);
  assert.ok(!/reingres|entrand|ingresand/i.test(AVISO_AGOTADO_ALFOMBRA));

  const { texto, acciones } = armarRespuesta(
    "Justo la alfombra bandeja 3D para tu Onix. Ya está entrando, en unos días la tenemos.",
    [{ herramienta: "consultar_precio", input: {}, resultado: r }], ctx);
  assert.ok(texto.includes(AVISO_AGOTADO_ALFOMBRA));
  assert.ok(!/entrando|unos d[ií]as/i.test(texto));
  assert.ok(!acciones.some((a) => a.herramienta === "derivar_a_humano"));
});

await testAsync("otro producto AGOTADO (cubre volante) -> el aviso de siempre", async () => {
  const ctx = { _ultimoUsuario: "tenes cubre volante para onix?", textoCharla: "cubre volante onix", _turno: { busco: false } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "cubre volante onix" }, ctx);
  assert.equal(r.agotado, true);
  assert.equal(r.textoAgotado, AVISO_AGOTADO);
});

await testAsync("alfombra agotada que en ML YA tiene stock -> se resincroniza y se vende normal", async () => {
  const ctx = { _ultimoUsuario: "alfombra onix 2025", textoCharla: "alfombra onix 2025", _turno: { busco: false },
    _stockEnVivo: async () => 3,
    _sincronizar: async () => {
      actualizarCatalogo(
        [{ id: "MLU200", n: "Alfombra Chevrolet Onix 2025 Bandeja Rigida 3d Negro", p: 3400, img: "https://http2.mlstatic.com/D_2-O.jpg" }],
        "test",
        [{ id: "MLU300", n: "Cubre Volante Chevrolet Onix Cuero Negro", p: 900, img: "https://http2.mlstatic.com/D_3-O.jpg" }]);
      return { ok: true };
    } };
  const r = await ejecutarHerramienta("consultar_precio", { modelo: "alfombra onix 2025" }, ctx);
  assert.equal(r.encontrado, true);
  assert.equal(r.textoAgotado, undefined);
  assert.equal(r.resultados[0].precio ?? r.resultados[0].p, 3400);
  catalogoBase();
});

// ─── 3. Material exclusivo (cuero Sport) ───
await testAsync("después del eco cuero va el material exclusivo, una sola vez", async () => {
  const ctx = { _ultimoUsuario: "cubreasientos para la strada", textoCharla: "cubreasientos para fiat strada", _turno: { busco: true } };
  const eco = await ejecutarHerramienta("mostrar_ecocuero", {}, ctx);
  const { texto } = armarRespuesta("Para tu Strada tenemos varias opciones.", [{ herramienta: "mostrar_ecocuero", input: {}, resultado: eco }], ctx);
  assert.ok(texto.includes(TEXTO_MATERIAL_EXCLUSIVO));
  assert.equal(texto.split("fibra de cuero reciclado").length - 1, 1);

  // Si ya se dijo en la charla, no se repite.
  const ctx2 = { ...ctx, textoCharla: `${ctx.textoCharla} ${TEXTO_MATERIAL_EXCLUSIVO}` };
  const { texto: t2 } = armarRespuesta("Te muestro de nuevo.", [{ herramienta: "mostrar_ecocuero", input: {}, resultado: eco }], ctx2);
  assert.ok(!t2.includes("fibra de cuero reciclado"));
});

await testAsync("cuero Sport: $19.800 colocado, 2 años de garantía, fibra de cuero reciclado", async () => {
  const d = await ejecutarHerramienta("descripcion_oficial", { linea: "cuero_sport" }, { _turno: { busco: true } });
  assert.equal(d.ok, true);
  assert.match(d.textoOficial, /\$19\.800 IVA incluido/);
  assert.match(d.textoOficial, /2 años de garantía total/);
  assert.match(d.textoOficial, /fibra de cuero reciclado/);
  assert.ok(!/18\.000|22\.000/.test(d.textoOficial));
  assert.equal(CUBREASIENTOS.sport.precioColocado, 19800);
});

// ─── 4. Colores: una sola imagen ───
await testAsync("colores -> UNA sola imagen (capitoneado y eco cuero juntos también)", async () => {
  const ctx = { _ultimoUsuario: "que colores tienen para la strada", textoCharla: "cubreasientos fiat strada colores", _turno: { busco: true } };
  const cap = await ejecutarHerramienta("mostrar_capitoneado", { que: "colores" }, ctx);
  const capRojo = await ejecutarHerramienta("mostrar_capitoneado", { que: "rojo" }, ctx);
  const eco = await ejecutarHerramienta("mostrar_ecocuero", {}, ctx);
  assert.equal(cap.fotos.length, 1);
  assert.equal(capRojo.fotos.length, 1);
  assert.equal(eco.fotos.length, 1);
  assert.equal(cap.fotos[0].img, MUESTRA_COLORES.img);
  const espuma = await ejecutarHerramienta("mostrar_capitoneado", { que: "espuma" }, ctx);
  assert.ok(espuma.fotos.every((f) => f.img !== MUESTRA_COLORES.img));

  const { imagenesEnviar } = armarRespuesta("Mirá los colores.", [
    { herramienta: "mostrar_capitoneado", input: {}, resultado: cap },
    { herramienta: "mostrar_ecocuero", input: {}, resultado: eco },
  ], ctx);
  assert.equal(imagenesEnviar.length, 1);
  assert.deepEqual(imagenesEnviar[0].lineas.sort(), ["capitoneado premium", "eco cuero"]);
});

// ─── 5. Demora: teléfono al pasar a un asesor ───
await testAsync("al derivar se agrega el teléfono por si hay demora (una vez por charla)", async () => {
  const deriv = { herramienta: "derivar_a_humano", input: { motivo: "pide_humano" }, resultado: { ok: true, derivacion: { id: "D9999" } } };
  const { texto } = armarRespuesta("Listo, te paso con un asesor.", [deriv], { textoCharla: "quiero hablar con alguien", _turno: {} });
  assert.ok(texto.endsWith(AVISO_DEMORA));
  const { texto: t2 } = armarRespuesta("Listo, te paso con un asesor.", [deriv], { textoCharla: `quiero hablar con alguien ${AVISO_DEMORA}`, _turno: {} });
  assert.ok(!t2.includes(AVISO_DEMORA));
  const soloOfrecida = { ...deriv, resultado: { ok: false, motivo: "solo_ofrecida" } };
  const { texto: t3 } = armarRespuesta("¿Querés que te pase con un asesor?", [soloOfrecida], { textoCharla: "hola", _turno: {} });
  assert.ok(!t3.includes(AVISO_DEMORA));
});

console.log(`\n✅ ${ok} pruebas de las CORRECCIONES DE RODRIGO en verde`);
