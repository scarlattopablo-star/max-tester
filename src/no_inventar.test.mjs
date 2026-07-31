// Test del filtro ANTI-INVENTO (pedido de Pablo, 31 jul 2026: "Max no puede inventar").
// Correr: node src/no_inventar.test.mjs
import assert from "node:assert/strict";
import { filtrarInventos, prometioAsesor } from "./cerebro.js";
import { FRASE_CONSULTO } from "./config.js";

let ok = 0;
function test(nombre, fn) { fn(); ok++; console.log(`  ✓ ${nombre}`); }

// ─── Lo que Max NO puede prometer: se borra la frase y se avisa ─────────
// El caso REAL que reportó Pablo: Max le dijo a un cliente que le hacían la
// alfombra a medida. Eso no existe.
test("alfombra a medida — se borra la frase y se ofrece consultar", () => {
  const r = filtrarInventos("Sí, te hacemos la alfombra a medida para tu Fiat Mobi.");
  assert.equal(r.invento, "alfombras a medida");
  assert.ok(!/a medida/i.test(r.texto));
  assert.ok(r.texto.includes(FRASE_CONSULTO));
});

// EL CASO REAL (31 jul 2026, MG ZS): la promesa no nombra el producto ("LA
// hacemos igual a medida"), así que hay que sacarlo del contexto de la charla.
test("caso MG ZS — 'no la tengo publicada, pero la hacemos igual a medida'", () => {
  const charla = "Hola, quiero más información. Alfombra Bandeja Rígida 3D Antiderrame. ¿Para qué auto la necesitás? Para MG ZS 1500 nafta.";
  const r = filtrarInventos("No tengo publicada todavía la MG ZS en el catálogo, pero tranquilo, la hacemos igual a medida.", charla);
  assert.equal(r.invento, "alfombras a medida");
  // La parte honesta se conserva; la promesa inventada se va.
  assert.ok(r.texto.startsWith("No tengo publicada todavía la MG ZS en el catálogo."));
  assert.ok(!/a medida|hacemos/i.test(r.texto));
  assert.ok(r.texto.includes(FRASE_CONSULTO));
});

test("caso MG ZS — sin contexto de alfombras no se toca (puede ser un cubreasiento)", () => {
  const t = "No tengo publicada todavía la MG ZS, pero tranquilo, la hacemos igual a medida.";
  assert.deepEqual(filtrarInventos(t, "Hola, ¿tenés cubreasientos para MG ZS?"), { texto: t, invento: null });
});

test("alfombra a medida al final — la parte buena del mensaje se conserva", () => {
  const r = filtrarInventos("Tenemos alfombras de goma para tu HB20. Si no te sirven, te la fabricamos a medida.");
  assert.equal(r.invento, "alfombras a medida");
  assert.ok(r.texto.includes("Tenemos alfombras de goma para tu HB20."));
  assert.ok(!/fabricamos/i.test(r.texto));
});

test("colocación de alfombras — no se colocan, se borra", () => {
  const r = filtrarInventos("La alfombra te la colocamos en el local sin costo.");
  assert.equal(r.invento, "alfombras a medida");
  assert.ok(!/colocamos/i.test(r.texto));
});

// El caso más peligroso: primero dice la verdad ("no hay publicada") y después
// igual la inventa. El "no" de la frase anterior no puede tapar el invento.
test("'no tengo publicada, pero te la fabricamos' — se borra igual", () => {
  const r = filtrarInventos("Para tu Kangoo no tengo alfombras publicadas. Igual te la podemos fabricar a medida sin problema.");
  assert.equal(r.invento, "alfombras a medida");
  assert.ok(r.texto.includes("Para tu Kangoo no tengo alfombras publicadas."));
  assert.ok(!/fabricar/i.test(r.texto));
});

test("'no tenemos alfombras a medida' — es la verdad, no se toca", () => {
  const t = "No tenemos alfombras a medida: son las que están publicadas.";
  assert.deepEqual(filtrarInventos(t), { texto: t, invento: null });
});

test("promesas sin nombrar el producto, con la charla hablando de alfombras", () => {
  const charla = "¿Tenés alfombras bandeja para una MG ZS?";
  for (const t of ["Tranquilo, igual te la conseguimos.", "No hay drama, la mandamos a hacer para tu modelo."]) {
    const r = filtrarInventos(t, charla);
    assert.equal(r.invento, "alfombras a medida", `debería cortarse: ${t}`);
    assert.equal(r.texto, FRASE_CONSULTO);
  }
});

test("cubre volante a medida — tampoco existe", () => {
  const r = filtrarInventos("El cubre volante lo confeccionamos a medida para tu Peugeot 208.");
  assert.equal(r.invento, "cubre volantes a medida");
  assert.ok(!/confeccionamos/i.test(r.texto));
});

test("cubreauto a pedido — tampoco", () => {
  const r = filtrarInventos("El cubreauto antigranizo lo mandamos a hacer a pedido para tu camioneta.");
  assert.equal(r.invento, "cubreautos a medida");
  assert.ok(!/a pedido/i.test(r.texto));
});

// ─── Lo que Max SÍ puede decir: no se toca ─────────────────────────────
test("cubreasientos a medida — es verdad, no se toca", () => {
  const t = "Los cubreasientos los hacemos a medida para tu Hilux, en las cuatro líneas.";
  assert.deepEqual(filtrarInventos(t), { texto: t, invento: null });
});

test("alfombra y cubreasiento en el mismo mensaje — gana el producto más cercano", () => {
  const t = "Para tu Polo tenemos alfombras de goma. Los cubreasientos capitoneados se confeccionan a medida.";
  assert.deepEqual(filtrarInventos(t), { texto: t, invento: null });
});

test("Max diciendo la VERDAD (negación) — no se toca", () => {
  const t = "Las alfombras no se hacen a medida: son las que están publicadas para cada modelo.";
  assert.deepEqual(filtrarInventos(t), { texto: t, invento: null });
});

test("alfombras sin colocación — no se toca", () => {
  const t = "Las alfombras las podés retirar cuando quieras, no llevan colocación.";
  assert.deepEqual(filtrarInventos(t), { texto: t, invento: null });
});

test("aviso normal de precios de cubreasientos — no se toca", () => {
  const t = "Te comparto las opciones para tu HB20 (los precios son sin colocación; la colocación se cotiza aparte).";
  assert.deepEqual(filtrarInventos(t), { texto: t, invento: null });
});

test("mensaje sin productos — no se toca", () => {
  const t = "¡Perfecto! ¿Cómo preferís abonar?";
  assert.deepEqual(filtrarInventos(t), { texto: t, invento: null });
});

// ─── Promesa de que sigue una persona => derivación obligatoria ────────
test("promesas de asesor que SÍ tienen que derivar", () => {
  for (const t of [
    FRASE_CONSULTO,
    "Te paso con un asesor enseguida.",
    "Un asesor de ventas se comunicará con usted a la brevedad.",
    "Dejame consultarlo con un vendedor y te confirmo.",
    "Lo consulto con el equipo y te aviso.",
    "Te contacta un asesor a la brevedad.",
  ]) assert.ok(prometioAsesor(t), `debería derivar: ${t}`);
});

test("frases normales que NO tienen que derivar", () => {
  for (const t of [
    "Te paso los datos de la transferencia.",
    "El costo de la colocación lo cotiza un asesor.",
    "Te paso el link de pago para que abones con tarjeta.",
    "¿Para qué modelo de auto es?",
  ]) assert.ok(!prometioAsesor(t), `no debería derivar: ${t}`);
});

console.log(`\n${ok} tests OK`);
