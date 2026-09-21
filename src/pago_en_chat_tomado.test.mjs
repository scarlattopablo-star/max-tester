// REGISTRAR LA PLATA QUE ENTRA EN UN CHAT QUE TOMÓ UN ASESOR.
//
// Con el chat pausado Max no razona: no hay respuesta suya donde leer "vi el
// comprobante", así que el disparador de la foto (maxVioUnComprobante) no aplica.
// Solo se registra con señales que dicen que hubo un pago SIN lugar a dudas: un
// PDF del banco, o que el cliente lo haya ESCRITO.
//
// ⛔ UNA FOTO NO ALCANZA, NUNCA. Se probó deducirlo del contexto (que el negocio
// hubiera pasado los datos de la cuenta justo antes) y se descartó: una foto del
// auto mandada después de pasar la cuenta entraría al panel como una
// transferencia que no existió. El panel es el registro de la plata — una fila
// inventada ahí es peor que la falta que veníamos a tapar.
import test from "node:test";
import assert from "node:assert/strict";
import { armarAvisos } from "./avisos_equipo.js";

const contacto = { nombre: "Ricardo", tel: "095420855" };

test("un comprobante en chat tomado se registra y se avisa", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({
    acciones: [],
    contacto,
    texto: "",
    chatId: "59895420855",
    comprobanteExterno: "Comprobante en un chat que tomó un asesor (PDF del banco)",
  });
  assert.ok(transferenciaSinRegistrar, "la plata tiene que quedar registrada");
  assert.equal(transferenciaSinRegistrar.comprobante, true);
  assert.match(transferenciaSinRegistrar.detalle, /chat que tomó un asesor/);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /COMPROBANTE DE TRANSFERENCIA RECIBIDO/);
});

test("el detalle conserva lo que escribió el cliente junto al comprobante", () => {
  const { transferenciaSinRegistrar } = armarAvisos({
    acciones: [],
    contacto,
    texto: "ahí va la seña",
    chatId: "59895420855",
    comprobanteExterno: "Comprobante en un chat que tomó un asesor",
  });
  assert.match(transferenciaSinRegistrar.detalle, /chat que tomó un asesor/);
  assert.match(transferenciaSinRegistrar.detalle, /ahí va la seña/);
});

test("sin ninguna señal NO se inventa una transferencia", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({
    acciones: [],
    contacto,
    texto: "",
    chatId: "59895420855",
  });
  assert.equal(transferenciaSinRegistrar, null);
  assert.equal(avisos.length, 0);
});

// El candado de la regla: que nadie vuelva a meter "deducir el pago del contexto".
test("CANDADO: no existe ninguna forma de deducir un pago por el contexto", async () => {
  const ws = await import("./ws_mensaje.js");
  assert.equal(
    ws.huboContextoDePago,
    undefined,
    "volvió el atajo de deducir el pago por el contexto: una foto NO es un comprobante",
  );
});
