// Max solo recuerda la VISITA actual (15 oct 2026): un cliente preguntó por cuero
// Sport para su Strada y Max le contestó por un Golf MK7 de una charla vieja.
import test from "node:test";
import assert from "node:assert/strict";
import { contextoVigente, HORAS_VISITA } from "./memoria.js";

const H = 60 * 60 * 1000;
const ahora = Date.UTC(2026, 9, 15, 13, 0);

test("charla vieja (más de HORAS_VISITA) no entra al contexto", () => {
  const msgs = [
    { role: "user", content: "alfombras para golf mk7", ts: ahora - 20 * 24 * H },
    { role: "assistant", content: "De alfombras para el Golf MK7 estamos sin stock", ts: ahora - 20 * 24 * H },
  ];
  assert.deepEqual(contextoVigente(msgs, ahora), []);
});

test("la visita de hoy queda entera y sin el campo ts", () => {
  const msgs = [
    { role: "user", content: "golf mk7", ts: ahora - 20 * 24 * H },
    { role: "assistant", content: "sin stock", ts: ahora - 20 * 24 * H },
    { role: "user", content: "cuero sport para strada", ts: ahora - 2 * H },
    { role: "assistant", content: "te muestro", ts: ahora - 2 * H + 1000 },
  ];
  assert.deepEqual(contextoVigente(msgs, ahora), [
    { role: "user", content: "cuero sport para strada" },
    { role: "assistant", content: "te muestro" },
  ]);
});

test("una charla que sigue al día siguiente (menos del corte) no se corta", () => {
  const msgs = [
    { role: "user", content: "quiero el capitoneado", ts: ahora - (HORAS_VISITA - 5) * H },
    { role: "assistant", content: "perfecto", ts: ahora - (HORAS_VISITA - 5) * H },
  ];
  assert.equal(contextoVigente(msgs, ahora).length, 2);
});

test("mensajes sin hora (simulador viejo) se conservan", () => {
  const msgs = [{ role: "user", content: "hola" }, { role: "assistant", content: "buenas" }];
  assert.equal(contextoVigente(msgs, ahora).length, 2);
});
