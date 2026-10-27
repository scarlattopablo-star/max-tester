// Envío "incluido" inventado (producción, 27 oct 2026). Un cliente preguntó "¿y DAC lo
// pagás tú?" y Max le dijo que el envío estaba incluido en el precio. Es falso: el envío
// por DAC lo paga el cliente al recibirlo (cobro en destino, config.js ENVIOS.costo).
// Correr: node --test src/envio_incluido.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { filtrarEnvioIncluido } from "./cerebro.js";
import { AVISO_ENVIO, ENVIOS } from "./config.js";

const REAL = "Jaja, no, DAC lo pagamos nosotros igual — ya está incluido en el precio. Lo que pasa es que si pagás por transferencia, el negocio te da un descuento del 10% sobre el total. Entonces en vez de pagar $4.900, pagás $4.410 (ya con el envío incluido). Es un beneficio que sacamos para incentivar la transferencia. ¿Dale entonces con transferencia?";

test("el caso real: se corrige la promesa y queda el precio", () => {
  const r = filtrarEnvioIncluido(REAL);
  assert.ok(r.frase, "detectó la promesa");
  assert.ok(!/pagamos nosotros|ya est[aá] incluido|env[ií]o incluido/i.test(r.texto), r.texto);
  assert.match(r.texto, /no est[aá] incluido en el precio: se abona al recibirlo/);
  assert.ok(r.texto.includes("pagás $4.410."), r.texto);
  assert.ok(r.texto.includes("descuento del 10%"));
  assert.ok(r.texto.includes("¿Dale entonces con transferencia?"));
});

test("otras formas de prometerlo", () => {
  for (const t of [
    "El envío es gratis a todo el país.",
    "El envío por DAC corre por nuestra cuenta.",
    "Te queda en $9.810 con envío incluido.",
    "El precio incluye el envío por DAC.",
  ]) {
    const r = filtrarEnvioIncluido(t);
    assert.ok(r.frase, `no lo detectó: ${t}`);
    assert.match(r.texto, /se abona al recibirlo/, t);
    assert.ok(!/gratis|nuestra cuenta|env[ií]o incluido|incluye el env/i.test(r.texto), r.texto);
  }
});

test("lo correcto no se toca", () => {
  for (const t of [
    "Lo mandamos por DAC. El envío no está incluido: lo abonás al recibirlo.",
    "El cuero Sport sale $19.800 colocado, IVA incluido.",
    "Tenemos una demora de entrega de 4 a 5 días hábiles.",
    "Son $4.410 por transferencia, el envío se paga aparte en destino.",
    "Te mando la alfombra sin envío, la pasás a retirar.",
  ]) {
    const r = filtrarEnvioIncluido(t);
    assert.equal(r.frase, null, t);
    assert.equal(r.texto, t);
  }
});

test("el aviso de envío y la config dicen que se paga en destino", () => {
  assert.match(AVISO_ENVIO, /NO est[aá] incluido/);
  assert.match(AVISO_ENVIO, /al recibirlo/);
  assert.match(ENVIOS.costo, /cobro en destino/);
});
