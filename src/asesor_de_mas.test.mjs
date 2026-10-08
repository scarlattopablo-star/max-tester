// ASESOR DE MÁS y AÑO DE MÁS en alfombras (probado contra producción, 8 oct 2026):
//  · con la alfombra ya mostrada y el precio dado, Max cerraba con "Dejame consultarlo
//    con un asesor…" → derivación al equipo por algo resuelto;
//  · "alfombras para HB20 sedán" → "Decime el año y te paso todo", sin buscar.
// Sin red y sin IA. Correr: node src/asesor_de_mas.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { armarRespuesta, pideAnioDeMas } from "./cerebro.js";
import { FRASE_CONSULTO } from "./config.js";

let ok = 0;
const test = (nombre, fn) => { fn(); ok++; console.log(`  ✓ ${nombre}`); };

actualizarCatalogo([{ id: "MLU11", n: "Alfombra Baúl Hb20 Sedan Bandeja 3d Negro", p: 2625, img: "https://http2.mlstatic.com/D_11-O.jpg" }], "test");
const FOTO = [{ herramienta: "consultar_precio", input: {}, resultado: { encontrado: true, resultados: [{ nombre: "Alfombra Baúl Hb20 Sedan Bandeja 3d Negro", precio: 2625 }] } }];
const ctxDe = (cliente, extra = {}) => ({ _ultimoUsuario: cliente, dichoPorElCliente: cliente, textoCharla: cliente, _turno: { busco: true, hayCatalogo: true }, ...extra });
const derivo = (r) => r.acciones.some((a) => a.herramienta === "derivar_a_humano" && a.resultado?.ok !== false);

test("alfombra mostrada con precio: se cae el 'lo consulto con un asesor' y no se deriva", () => {
  const r = armarRespuesta(`Para el HB20 sedán tenemos la alfombra de baúl, a $2.625. ¿Te interesa?\n\n${FRASE_CONSULTO}`, [...FOTO], ctxDe("alfombras hb20 sedán precio"));
  assert.equal(r.texto, "Para el HB20 sedán tenemos la alfombra de baúl, a $2.625. ¿Te interesa?");
  assert.equal(derivo(r), false);
});

test("repregunta sin buscar (Tucson): mismo freno con lo que ya se le mostró", () => {
  const charla = "alfombras tucson [Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Hyundai Tucson 2021+  Goma Negro - $ 2.700.] y trae la del baul?";
  const r = armarRespuesta(`No, esa es solo la del piso.\n\n${FRASE_CONSULTO}`, [], { _ultimoUsuario: "y trae la del baul?", dichoPorElCliente: "alfombras tucson y trae la del baul?", textoCharla: charla, _turno: { busco: false } });
  assert.equal(r.texto, "No, esa es solo la del piso.");
  assert.equal(derivo(r), false);
});

test("si el cliente PIDE una persona, se deriva igual", () => {
  const r = armarRespuesta(`Dale, ${FRASE_CONSULTO}`, [...FOTO], ctxDe("alfombras hb20 sedan, quiero hablar con un asesor"));
  assert.ok(derivo(r));
});

test("si Max le había ofrecido el asesor y dice que sí, se deriva", () => {
  const ctx = ctxDe("sí", { dichoPorElCliente: "alfombras hb20 sedan sí", textoCharla: "alfombras hb20 sedan [Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Baúl Hb20 Sedan Bandeja 3d Negro - $ 2.625.] ¿Querés que te pase con un asesor? sí" });
  const r = armarRespuesta(FRASE_CONSULTO, [], ctx);
  assert.ok(derivo(r));
});

test("cubreasientos: no se toca (ahí el asesor es parte del flujo)", () => {
  const r = armarRespuesta(`El capitoneado se cotiza aparte. ${FRASE_CONSULTO}`, [], ctxDe("cubreasiento capitoneado hb20"));
  assert.ok(derivo(r));
});

test("año de más: alfombra + auto conocido + no buscó → se frena", () => {
  const c = { _ultimoUsuario: "Hola, alfombras para HB20 sedán?", dichoPorElCliente: "Hola, alfombras para HB20 sedán?", _turno: { busco: false } };
  assert.ok(pideAnioDeMas("Tenemos opciones para tu HB20 sedán. Decime el año y te paso todo.", c));
  assert.ok(!pideAnioDeMas("Tenemos opciones para tu HB20 sedán. Decime el año y te paso todo.", { ...c, _turno: { busco: true } }));
  assert.ok(!pideAnioDeMas("Te comparto las opciones para tu HB20 sedán.", c));
  // Sin auto todavía, pedir datos está bien.
  assert.ok(!pideAnioDeMas("¿Para qué auto y de qué año?", { _ultimoUsuario: "hola tienen alfombras?", dichoPorElCliente: "hola tienen alfombras?", _turno: { busco: false } }));
  // Cubreasientos: el año sí hace falta.
  assert.ok(!pideAnioDeMas("Decime el año.", { _ultimoUsuario: "cubreasiento capitoneado hb20", dichoPorElCliente: "cubreasiento capitoneado hb20", _turno: { busco: false } }));
});

console.log(`\n${ok} OK`);
