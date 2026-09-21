// SALUD DEL CANAL DE AVISOS.
//
// El 18 sep 2026 el número de avisos (096 895 164) dejó de recibir: Meta aceptaba
// el envío con 200 y después reportaba por el webhook status=failed code 131026
// "Message undeliverable". Como el rebote solo quedaba en un buffer de 60 eventos
// y en stdout, el equipo estuvo 3 días sin derivaciones ni avisos de transferencia
// sin que nadie se enterara. Ya había pasado algo igual en ago 2026 (3 semanas).
//
// Estos tests fijan lo mínimo para que un aviso que rebota NO sea silencioso:
// el canal queda marcado como caído y el texto se puede reintentar por otro lado.
import test from "node:test";
import assert from "node:assert/strict";
import { recordarEnvio, marcarEntregado, marcarRebote, salud, reset } from "./avisos_salud.js";

test("un aviso que rebota deja el canal CAÍDO y devuelve el texto para reintentarlo", () => {
  reset();
  assert.equal(salud().ok, true, "el canal arranca sano");

  recordarEnvio("wamid.AAA", "🏦 UN CLIENTE AVISA QUE TRANSFIRIÓ");
  const rebote = marcarRebote("wamid.AAA", 131026, "Message undeliverable");

  assert.equal(rebote.texto, "🏦 UN CLIENTE AVISA QUE TRANSFIRIÓ", "sin el texto no se puede reintentar por el respaldo");
  assert.equal(salud().ok, false, "un aviso rebotado tiene que dejar el canal marcado como caído");
  assert.equal(salud().consecutivos, 1);
  assert.equal(salud().ultimoRebote.code, 131026);
});

test("rebotes seguidos se acumulan: distingue un mensaje suelto de un canal cortado", () => {
  reset();
  for (const id of ["wamid.1", "wamid.2", "wamid.3"]) {
    recordarEnvio(id, `aviso ${id}`);
    marcarRebote(id, 131026, "Message undeliverable");
  }
  assert.equal(salud().consecutivos, 3);
  assert.equal(salud().ok, false);
});

test("una entrega exitosa devuelve el canal a sano y limpia el contador", () => {
  reset();
  recordarEnvio("wamid.X", "aviso que rebota");
  marcarRebote("wamid.X", 131026, "Message undeliverable");
  assert.equal(salud().ok, false);

  recordarEnvio("wamid.Y", "aviso que sí llega");
  marcarEntregado("wamid.Y");

  assert.equal(salud().ok, true, "si un aviso llega, el canal volvió");
  assert.equal(salud().consecutivos, 0);
  assert.ok(salud().ultimoOk, "queda registrado cuándo fue la última vez que un aviso llegó");
});

test("el fallo de un mensaje a un CLIENTE no ensucia la salud del canal de avisos", () => {
  reset();
  // El webhook de statuses trae los fallos de TODOS los envíos, también los de
  // clientes. Solo los avisos al equipo (los que pasaron por recordarEnvio)
  // cuentan: si no, un cliente con el teléfono mal apagaría la alarma de verdad.
  const rebote = marcarRebote("wamid.DE-UN-CLIENTE", 131026, "Message undeliverable");

  assert.equal(rebote.texto, "", "de un id desconocido no hay texto que reintentar");
  assert.equal(salud().ok, true, "el canal de avisos sigue sano");
  assert.equal(salud().consecutivos, 0);
});

test("no crece sin límite: recordar muchos avisos no deja la memoria suelta", () => {
  reset();
  for (let i = 0; i < 500; i++) recordarEnvio(`wamid.${i}`, `aviso ${i}`);
  assert.equal(salud().recordados <= 100, true, `guardó ${salud().recordados} avisos en memoria`);
  // El más nuevo siempre tiene que estar: es el que puede rebotar en cualquier momento.
  recordarEnvio("wamid.ultimo", "el último aviso");
  assert.equal(marcarRebote("wamid.ultimo", 131026, "x").texto, "el último aviso");
});
