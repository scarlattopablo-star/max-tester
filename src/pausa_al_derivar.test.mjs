// Pausa al derivar (pedido de Pablo, 19 nov 2026): el asesor contesta desde su
// número con el link del aviso, así que Max se calla en ese chat apenas deriva —
// pero SOLO si el aviso puede llegar.
import test from "node:test";
import assert from "node:assert/strict";
import { pausarAlDerivar } from "./avisos_equipo.js";

const derivo = [{ herramienta: "derivar_a_humano", input: { motivo: "otro", resumen: "Clio" }, resultado: { ok: true } }];
const vivo = { destinos: [{ numero: "…123", ok: true, ultimoOk: "2026-11-19T12:00:00.000Z" }] };
const mudo = { destinos: [{ numero: "…164", ok: false, ultimoOk: null }] };

test("deriva con el canal entregando → se pausa", () => {
  assert.equal(pausarAlDerivar(derivo, vivo), true);
  // Uno muerto y otro vivo: el aviso llega por el vivo.
  assert.equal(pausarAlDerivar(derivo, { destinos: [...mudo.destinos, ...vivo.destinos] }), true);
});

test("canal mudo o sin entregas confirmadas → NO se pausa (nadie se enteraría)", () => {
  assert.equal(pausarAlDerivar(derivo, mudo), false);
  assert.equal(pausarAlDerivar(derivo, { destinos: [] }), false);
  assert.equal(pausarAlDerivar(derivo, null), false);
});

test("sin derivación, o derivación rechazada / solo ofrecida → NO se pausa", () => {
  assert.equal(pausarAlDerivar([], vivo), false);
  assert.equal(pausarAlDerivar([{ herramienta: "derivar_a_humano", resultado: { ok: false } }], vivo), false);
  assert.equal(pausarAlDerivar([{ herramienta: "consultar_precio", resultado: { ok: true } }], vivo), false);
});
