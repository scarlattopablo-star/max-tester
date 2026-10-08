// ASESOR DE MÁS y AÑO DE MÁS en alfombras (probado contra producción, 8 oct 2026):
//  · con la alfombra ya mostrada y el precio dado, Max cerraba con "Dejame consultarlo
//    con un asesor…" → derivación al equipo por algo resuelto;
//  · "alfombras para HB20 sedán" → "Decime el año y te paso todo", sin buscar.
// Sin red y sin IA. Correr: node src/asesor_de_mas.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { actualizarCatalogo } from "./catalogo_vivo.js";
import { armarRespuesta, pideAnioDeMas, filtrarPrecios, filtrarInventos, filtrarJuegoAlfombras, notaCotizadas } from "./cerebro.js";
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

// La causa real del asesor de más en la repregunta: el filtro de precios.
actualizarCatalogo([{ id: "MLU1", n: "Alfombra Hyundai Tucson 2021+  Goma Negro", p: 2700 }], "test");
const CHARLA_TUCSON = "alfombras tucson [Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Hyundai Tucson 2021+  Goma Negro - $ 2.700.] y trae la del baul?";

test("repregunta sin herramienta: el 10% de transferencia de un precio real NO es inventado", () => {
  const t = "No, es solo la de piso. Sale $2.700, o $2.430 por transferencia.";
  assert.deepEqual(filtrarPrecios(t, [], CHARLA_TUCSON), { texto: t, inventado: null });
});

test("un precio que no sale del catálogo se sigue frenando", () => {
  const r = filtrarPrecios("No, es solo la de piso. Sale $2.850.", [], CHARLA_TUCSON);
  assert.equal(r.inventado, 2850);
});

test("el 10% de un precio inventado tampoco pasa", () => {
  const r = filtrarPrecios("Sale $2.565 por transferencia.", [], "te dije que sale $ 2.850");
  assert.equal(r.inventado, 2565);
});

// ─── Las otras dos causas del asesor de más (producción, 8 oct 2026) ───
const derivoR = (r) => r.acciones.some((a) => a.herramienta === "derivar_a_humano" && a.resultado?.ok !== false);
const CTX_TUCSON = () => ({ _ultimoUsuario: "y trae la del baul tambien?", dichoPorElCliente: "alfombras tucson y trae la del baul tambien?", textoCharla: CHARLA_TUCSON, _turno: { busco: false } });

test("ofrecer esperar/encargar la pieza que NO hay: se cae esa oración, sin asesor", () => {
  for (const cola of ["¿Te sirve solo la del piso, o preferís esperar a que entre la del baúl?", "La del baúl te la conseguimos a pedido.", "La del baúl la podemos encargar."]) {
    const r = armarRespuesta(`No, es solo la del piso. Para el Tucson no tenemos alfombra de baúl. ${cola}`, [], CTX_TUCSON());
    assert.equal(r.texto, "No, es solo la del piso. Para el Tucson no tenemos alfombra de baúl.", cola);
    assert.equal(derivoR(r), false, cola);
  }
});

test("'es a pedido' cuando de verdad hay artículos a pedido: no es invento", () => {
  const t = "La 2 trae las dos. La 1 es solo de baúl y es a pedido. ¿Cuál te va mejor?";
  assert.equal(filtrarInventos(t, "alfombras", true).invento, null);
  // Sin artículos a pedido en la charla, sigue siendo sospechoso.
  assert.ok(filtrarInventos(t, "alfombras", false).invento);
  // Y "a medida" nunca: las alfombras no se fabrican.
  assert.ok(filtrarInventos("Esa alfombra te la hacemos a medida.", "alfombras", true).invento);
});

// ─── Precio que cambió en ML entre una sync y otra ─────────────────────
test("precio que el sistema mostró en la foto vale aunque el catálogo ya cambió", () => {
  actualizarCatalogo([{ id: "MLU11", n: "Alfombra Baúl Hb20 Sedan Bandeja 3d Negro", p: 2625 }], "test"); // antes era 2.672
  const charla = "alfombras hb20 sedan [Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Baúl Hb20 Sedan Bandeja 3d Negro - $ 2.672.] cual trae la del baul?";
  const t = "La opción 1 es la del baúl, a $2.672 (o $2.405 por transferencia).";
  assert.deepEqual(filtrarPrecios(t, [], charla), { texto: t, inventado: null });
  // Lo que Max escribió de memoria (fuera de la nota) no se auto-autoriza.
  assert.equal(filtrarPrecios("Sale $2.850.", [], "Max: sale $ 2.850").inventado, 2850);
});

// ─── Cotizó sin foto: igual queda anotado qué se le mostró ─────────────
test("cotizado sin foto: la nota guarda piezas y precios, y el filtro la usa", () => {
  const acc = [{ herramienta: "consultar_precio", resultado: { encontrado: true, resultados: [{ nombre: "Alfombra Hyundai Tucson 2021+  Goma Negro", precio: 2700 }] } }];
  const nota = notaCotizadas(acc);
  assert.match(nota, /opciones que le coticé sin foto: 1\) Alfombra Hyundai Tucson 2021\+  Goma Negro - \$ 2\.700\./);
  assert.match(nota, /NO hay alfombra de baúl/);
  const charla = `alfombra para tucson Tenemos la de piso.\u2063${nota} viene con la del baúl?`;
  const r = filtrarJuegoAlfombras("No, esa es solo la de piso. ¿Te interesa también la del baúl para completar el juego?", [], charla);
  assert.equal(r, "No, esa es solo la de piso.");
  assert.equal(notaCotizadas([{ herramienta: "consultar_precio", resultado: { encontrado: true, resultados: [{ nombre: "Cubreasiento Hilux Negro", precio: 9000 }] } }]), "");
});

test("'la opción que te mostré trae la del baúl' (es la de baúl): no se borra", () => {
  const charla = "alfombras hb20 sedan [Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Baúl Hb20 Sedan Bandeja 3d Negro - $ 2.625.]";
  const t = "La opción que te mostré trae la del baúl. Es la única que tenemos para el HB20 sedán.";
  assert.equal(filtrarJuegoAlfombras(t, [], charla), t);
  // Pero "la de piso trae también la del baúl" sí.
  assert.equal(filtrarJuegoAlfombras("Sí. La de piso trae también la del baúl.", [], "alfombra tucson [Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Hyundai Tucson 2021+  Goma Negro - $ 2.700.]"), "Sí.");
});

test("'¿o preferís esperar?' sin nombrar la pieza que no hay: también se cae", () => {
  const charla = "alfombra tucson [Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Hyundai Tucson 2021+  Goma Negro - $ 2.700.]";
  assert.equal(filtrarJuegoAlfombras("No, es solo la de piso. ¿Te interesa la del piso igual, o preferís esperar?", [], charla), "No, es solo la de piso.");
  assert.equal(filtrarJuegoAlfombras("No hace falta esperar: la tenés en el momento.", [], charla), "No hace falta esperar: la tenés en el momento.");
});

console.log(`\n${ok} OK`);
