// Max no le puede mandar al cliente su propio razonamiento interno.
//
// Caso REAL (7-sep-2026, produccion, con Sonnet 5): el cliente escribio
// "alfonbra para chebrolet spin" y Max contesto:
//     "Espera, corrijo: primero preguntame si querés que te avise cuando llegue, ¿te sirve?"
// Eso es Max hablandose a si mismo. El cliente recibe un mensaje incomprensible.
//
// De donde sale: en el bucle de herramientas (cerebro.js) el modelo a veces escribe
// texto JUNTO con un tool_use. Ese texto se guarda en `textoParcial` como respaldo por
// si la vuelta final viene vacia. Pero es un fragmento INTERMEDIO —el modelo lo escribe
// mientras decide, no como mensaje final— y se usaba tal cual, sin validar.
//
// ⚠️ El filtro va por ORACION, no por parrafo: el texto llega colapsado y filtrar el
// parrafo entero borraba el mensaje completo (mismo error que ya se cometio con el
// aviso de envio).
import { test } from "node:test";
import assert from "node:assert";

process.env.CATALOGO_SIN_DISCO = "1";
const { limpiarRazonamiento } = await import("./cerebro.js");

const salida = (t) => limpiarRazonamiento(t).trim();

test("se va la auto-correccion que vio el cliente en produccion", () => {
  const r = salida("Espera, corrijo: primero preguntame si querés que te avise cuando llegue, ¿te sirve?");
  assert.ok(!/corrijo/i.test(r), `quedo la auto-correccion: ${r}`);
  assert.ok(!/preguntame/i.test(r), `quedo la auto-instruccion: ${r}`);
});

test("se va la narracion de la herramienta", () => {
  for (const t of [
    "Voy a llamar a la herramienta enviar_foto para mostrarle las opciones.",
    "Déjame usar consultar_precio para ver cuánto sale.",
    "Ahora uso derivar_a_humano.",
  ]) {
    const r = salida(t);
    assert.ok(!/enviar_foto|consultar_precio|derivar_a_humano/.test(r),
      `se filtro el nombre de la herramienta al cliente: ${r}`);
  }
});

test("se va la auto-instruccion en segunda persona hacia si mismo", () => {
  for (const t of [
    "Perdón, me corrijo: tengo que buscar primero el producto.",
    "Espera, primero debo consultar el catálogo.",
  ]) {
    const r = salida(t);
    assert.ok(!/me corrijo|tengo que buscar|debo consultar/i.test(r), `quedo: ${r}`);
  }
});

test("NO toca los mensajes legitimos", () => {
  for (const t of [
    "Buenas tardes, le comparto las opciones para su Hilux.",
    "Actualmente está agotado, no tenemos en stock. ¿Querés que te avise apenas llegue?",
    "Te mando fotos de todo así lo ves con tus ojos.",
    "Ya te paso con un asesor para que te cotice.",
    "Voy a necesitar que me digas el año de tu Strada.",
    "Perdón por la demora, enseguida te confirmo el precio.",
  ]) {
    assert.strictEqual(salida(t), t, `se comio un mensaje bueno: ${t}`);
  }
});

test("filtra por ORACION: conserva la parte util del mensaje", () => {
  const r = salida("Espera, corrijo: primero preguntame. Actualmente está agotado, ¿querés que te avise?");
  assert.ok(/agotado/i.test(r), `borro el mensaje entero en vez de la oracion mala: ${JSON.stringify(r)}`);
  assert.ok(!/corrijo/i.test(r), `dejo la oracion mala: ${r}`);
});

test("si TODO era razonamiento, devuelve vacio (que caiga al fallback)", () => {
  assert.strictEqual(salida("Espera, corrijo: primero preguntame si querés que te avise."), "");
});
