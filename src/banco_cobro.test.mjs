// Banco de cobro cambiado (producción, 23 oct 2026). Un cliente escribió
// "Transferencia brou" (SU banco) y Max le pasó los datos como "*Banco: Brou*,
// Cuenta: 5022900, Everbox SA". La cuenta es del Itaú: el banco destino es fijo
// (config.js, datosCobro.transferencia) y el que nombra el cliente es desde donde paga él.
// Correr: node --test src/banco_cobro.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { filtrarBancoCobro } from "./cerebro.js";

const REAL = "Perfecto, transferencia. Te paso los datos: *Banco: Brou*\nCuenta: 5022900\nA nombre de: Everbox SA Con transferencia tenés *10% de descuento, así que el total te queda en* $9.810 (en vez de $10.900). Una vez que transfieras, me pasás el comprobante.";

test("el caso real: 'Banco: Brou' con nuestra cuenta pasa a Itaú", () => {
  const r = filtrarBancoCobro(REAL);
  assert.equal(r.banco, "Brou");
  assert.ok(r.texto.includes("*Banco: Itaú*"));
  assert.ok(!/brou/i.test(r.texto));
  assert.ok(r.texto.includes("Cuenta: 5022900"), "el resto del mensaje queda igual");
  assert.ok(r.texto.includes("$9.810"));
});

test("otras formas: 'Banco Santander', 'cuenta del Scotiabank', 'cuenta Nº 5022900 del BROU'", () => {
  for (const [entrada, esperado] of [
    ["Datos: Banco Santander, cuenta 5022900, Everbox SA.", "Banco Itaú, cuenta 5022900"],
    ["Transferí a la cuenta del Scotiabank 5022900 a nombre de Everbox SA.", "cuenta del Itaú 5022900"],
    ["Cuenta Nº 5022900 del BROU, titular Everbox SA.", "Cuenta Nº 5022900 del Itaú"],
  ]) {
    const r = filtrarBancoCobro(entrada);
    assert.ok(r.banco, entrada);
    assert.ok(r.texto.includes(esperado), `${entrada} → ${r.texto}`);
  }
});

test("si ya dice Itaú no toca nada", () => {
  const ok = "Te paso los datos: *Banco: Itaú*\nCuenta: 5022900\nA nombre de: Everbox SA.";
  const r = filtrarBancoCobro(ok);
  assert.equal(r.banco, null);
  assert.equal(r.texto, ok);
});

test("nombrar el banco del cliente sin nuestros datos no es error", () => {
  for (const t of [
    "¡Perfecto! Desde el Brou te sirve igual. ¿Te paso los datos?",
    "Sí, podés pagar con tu cuenta del Santander sin problema.",
    "",
  ]) {
    const r = filtrarBancoCobro(t);
    assert.equal(r.banco, null, t);
    assert.equal(r.texto, t);
  }
});

test("con nuestros datos, el banco del cliente dicho como origen se respeta", () => {
  // "desde el Brou" no es "Banco: Brou" ni "cuenta del Brou": queda.
  const t = "Desde el Brou te sirve igual. Datos: Banco Itaú, cuenta 5022900, Everbox SA.";
  const r = filtrarBancoCobro(t);
  assert.equal(r.banco, null);
  assert.equal(r.texto, t);
});
