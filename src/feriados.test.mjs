// Feriados inventados (auditoría 19 oct 2026). El 15 oct Max le dijo a un cliente
// que el viernes 16 no se trabajaba por el "Día de la Cultura": no era feriado.
// Correr: node --test src/feriados.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { filtrarFeriados, calendarioLocal } from "./cerebro.js";

// Jueves 15 oct 2026, 15:00 en Uruguay (18:00 UTC).
const JUE_15 = Date.UTC(2026, 9, 15, 18, 0);

test("calendario: el viernes 16 abre, sábado y domingo cierran", () => {
  const cal = calendarioLocal(5, JUE_15);
  assert.deepEqual(cal.map((c) => `${c.dia} ${c.num} ${c.abre}`), [
    "jueves 15 true", "viernes 16 true", "sábado 17 false", "domingo 18 false", "lunes 19 true",
  ]);
});

test("el caso real: 'el viernes 16 es feriado' se borra y queda el horario", () => {
  const r = filtrarFeriados("Perfecto. Te aviso que el viernes 16 es feriado por el Día de la Cultura, así que no abrimos. Podés pasar el lunes 19.", calendarioLocal(15, JUE_15));
  assert.ok(r.feriado);
  assert.ok(!/feriado|cultura|no abrimos/i.test(r.texto));
  assert.ok(r.texto.includes("Podés pasar el lunes 19."));
  assert.ok(/lunes a viernes de 9:00/i.test(r.texto));
});

test("'ese día no se trabaja' sin nombrar feriado también se va", () => {
  const r = filtrarFeriados("El viernes no se trabaja. ¿Te queda bien el lunes?", calendarioLocal(15, JUE_15));
  assert.ok(r.feriado);
  assert.ok(!/no se trabaja/.test(r.texto));
});

test("el horario normal (sábados y domingos cerrado) no se toca", () => {
  const t = "Estamos de lunes a viernes de 9:00 a 12:30 y de 13:00 a 18:00 hs (cerrado de 12:30 a 13:00). Sábados y domingos cerrado.";
  assert.equal(filtrarFeriados(t, calendarioLocal(15, JUE_15)).texto, t);
  assert.equal(filtrarFeriados("Hoy es domingo así que estamos cerrado, pero podés pasar mañana.", calendarioLocal(15, JUE_15)).feriado, null);
});

test("decir que se abre el feriado no se toca", () => {
  const t = "Sí, ese día abrimos en el horario normal aunque sea feriado.";
  assert.equal(filtrarFeriados(t, calendarioLocal(15, JUE_15)).feriado, null);
});

test("con un cierre cargado en DIAS_CERRADO, Max puede nombrarlo", () => {
  const cal = calendarioLocal(15, JUE_15).map((c) => (c.fecha === "2026-10-16" ? { ...c, abre: false, motivo: "feriado" } : c));
  assert.equal(filtrarFeriados("El viernes 16 es feriado y estamos cerrados.", cal).feriado, null);
});
