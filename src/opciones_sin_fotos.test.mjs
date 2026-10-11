// OPCIONES QUE NUNCA SE MOSTRARON (producción, 10 oct 2026): el cliente pidió
// alfombras para su Oroch doble cabina y Max contestó "¿Cuál de las opciones te
// interesa?" y "¿Cuál te gustó de las opciones que te mostré?" sin haber mandado
// ninguna foto. Si pide elegir entre opciones que el cliente no vio, se le da una
// vuelta más para que las busque.
// Sin red y sin IA. Correr: node src/opciones_sin_fotos.test.mjs   (o npm test)
process.env.CATALOGO_SIN_DISCO = "1";
import assert from "node:assert/strict";
import { opcionesSinFotos } from "./cerebro.js";

let ok = 0;
const test = (nombre, fn) => { fn(); ok++; console.log(`  ✓ ${nombre}`); };

const FOTOS_OROCH = [{ herramienta: "enviar_foto", input: { producto: "alfombra Oroch doble cabina" }, resultado: { ok: true, enviadas: 2, fotos: [{ nombre: "Alfombra Oroch Bandeja Rigida  Maxima Resistencia Negro", img: "https://x/1.jpg", precio: 3790 }] } }];
const NOTA = "[Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1) Alfombra Oroch Bandeja Rigida  Maxima Resistencia Negro - $ 3.790.]";
const ctx = (recientes = "") => ({ _recientesMax: recientes, _turno: { busco: false } });

test("el caso real: '¿Cuál de las opciones te interesa?' sin fotos → se frena", () => {
  assert.ok(opcionesSinFotos("¿Cuál de las opciones te interesa?", [], ctx("Sí, tenemos para la Oroch. ¿Es cabina simple o doble?")));
});

test("el caso real, segundo mensaje: '¿Cuál te gustó de las opciones que te mostré?' → se frena", () => {
  assert.ok(opcionesSinFotos("¿Cuál te gustó de las opciones que te mostré?", [], ctx("¿Cuál de las opciones te interesa?")));
});

test("si en este turno salieron las fotos, no se toca", () => {
  assert.ok(!opcionesSinFotos("Te comparto las opciones para tu Oroch. ¿Cuál de las opciones te interesa?", FOTOS_OROCH, ctx()));
});

test("si se le mostraron hace poco (nota interna del historial), no se toca", () => {
  assert.ok(!opcionesSinFotos("¿Cuál de las dos te gustó más?", [], ctx(`Te comparto las opciones.${"⁣"}${NOTA}`)));
});

test("también vale lo cotizado sin foto", () => {
  const nota = "[Contexto interno — opciones que le coticé sin foto: 1) Alfombra Oroch Bandeja Rigida - $ 3.790.]";
  assert.ok(!opcionesSinFotos("¿Cuál de las dos te interesa?", [], ctx(`La de piso sale $3.790.${"⁣"}${nota}`)));
});

test("si la búsqueda no trajo nada, sigue frenando (no vio nada)", () => {
  const vacio = [{ herramienta: "enviar_foto", input: {}, resultado: { ok: false, falta_modelo: true } }];
  assert.ok(opcionesSinFotos("¿Cuál de las opciones te interesa?", vacio, ctx()));
});

test("si el texto ya trae los precios, el cliente tiene qué elegir: no se toca", () => {
  assert.ok(!opcionesSinFotos("Tenemos la de caja a $3.325 y la de piso a $3.790. ¿Cuál de las dos te interesa?", [], ctx()));
});

test("preguntas que no piden elegir no se tocan", () => {
  assert.ok(!opcionesSinFotos("Sí, tenemos para la Oroch. ¿Es cabina simple o doble?", [], ctx()));
  assert.ok(!opcionesSinFotos("¿Para qué vehículo es?", [], ctx()));
});

console.log(`\n${ok} pruebas OK`);
