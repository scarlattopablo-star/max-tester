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
  assert.equal(salud().recordados <= 200, true, `guardó ${salud().recordados} avisos en memoria`);
  // El más nuevo siempre tiene que estar: es el que puede rebotar en cualquier momento.
  recordarEnvio("wamid.ultimo", "el último aviso");
  assert.equal(marcarRebote("wamid.ultimo", 131026, "x").texto, "el último aviso");
});

// ── 19 nov 2026: dos meses de avisos mudos ──────────────────────────────────
// La alarma de arriba existía, pero solo en /api/estado y nadie la miraba; y el
// destino por defecto era el 091 = el número de Max (se mandaba los avisos a sí mismo).
import { destinosAvisos, aprenderNumeroPropio, enmascarar } from "./avisos_salud.js";

test("NUMERO_AVISOS admite varios números y suma el de respaldo, sin repetir", () => {
  reset();
  const { destinos } = destinosAvisos({ NUMERO_AVISOS: "096895164, 099111222", NUMERO_AVISOS_RESPALDO: "099111222;098333444" });
  assert.deepEqual(destinos, ["59896895164", "59899111222", "59898333444"]);
});

test("el número del PROPIO bot nunca es destino de avisos (rebota siempre con 131026)", () => {
  reset();
  const r = destinosAvisos({ NUMERO_AVISOS: "091629784,096895164", NUMERO_BOT: "091629784" });
  assert.deepEqual(r.destinos, ["59896895164"]);
  assert.equal(r.descartados.length, 1);
  assert.match(r.descartados[0].motivo, /propio bot/);
});

test("sin NUMERO_BOT, el número propio se aprende del webhook y igual se descarta", () => {
  reset();
  aprenderNumeroPropio("59891629784"); // metadata.display_phone_number
  const r = destinosAvisos({ NUMERO_AVISOS: "091629784" });
  assert.deepEqual(r.destinos, [], "mandarse avisos a uno mismo no es un destino");
  const s = salud(r);
  assert.equal(s.ok, false);
  assert.equal(s.mudo, true, "sin ningún destino válido el equipo está mudo: tiene que sonar la alarma");
  assert.ok(s.problema);
});

test("un número muerto y otro vivo: ok:false (hay que arreglarlo) pero NO mudo", () => {
  reset();
  recordarEnvio("w.a", "aviso", "59896895164");
  recordarEnvio("w.b", "aviso", "59899111222");
  marcarRebote("w.a", 131026, "Message undeliverable");
  marcarEntregado("w.b");
  const s = salud();
  assert.equal(s.ok, false, "el número que rebota tiene que verse aunque el otro ande");
  assert.equal(s.mudo, false, "el equipo sigue recibiendo por el otro número");
  const muerto = s.destinos.find((d) => d.numero === "…164");
  assert.equal(muerto.consecutivos, 1);
  assert.equal(s.destinos.find((d) => d.numero === "…222").ok, true);
});

test("todos los números rebotando = mudo", () => {
  reset();
  recordarEnvio("w.1", "aviso", "59896895164");
  marcarRebote("w.1", 131026, "x");
  assert.equal(salud().mudo, true);
});

test("/api/estado es público: los números salen enmascarados", () => {
  assert.equal(enmascarar("59896895164"), "…164");
  reset();
  const s = salud(destinosAvisos({ NUMERO_AVISOS: "096895164" }));
  assert.deepEqual(s.configurados, ["…164"]);
  assert.ok(!JSON.stringify(s).includes("96895164"), "no se publica el número entero");
});
