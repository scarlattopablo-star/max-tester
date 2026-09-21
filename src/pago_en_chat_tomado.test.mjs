// REGISTRAR LA PLATA QUE ENTRA EN UN CHAT QUE TOMÓ UN ASESOR.
//
// Con el chat pausado Max no razona: no hay respuesta suya donde leer "vi el
// comprobante", así que el disparador de la foto (maxVioUnComprobante) no sirve
// acá. Lo único determinístico que queda es el CONTEXTO: si el negocio acaba de
// pasar los datos de la cuenta y enseguida entra una foto, esa foto es el pago.
//
// Medido sobre el 21 sep 2026: de 23 fotos de clientes, el criterio deja 7 (en 4
// chats), y entre ellas está el comprobante de Abitab por $1.000 que se perdió.
// Las otras 3 fueron a chats donde el asesor había pasado la cuenta del Itaú y
// después contestó "buenisimo!" y "Ah perfecto": pagos, casi seguro.
import test from "node:test";
import assert from "node:assert/strict";
import { huboContextoDePago } from "./ws_mensaje.js";

// TEXTUAL del chat 59895420855 (el caso del comprobante de Abitab perdido).
const CHARLA_ABITAB = [
  { role: "user", content: "Esa es la que quiero gracias." },
  { role: "assistant", content: "abitab Nro.3343 la casa del cubreasiento" },
  { role: "user", content: "👍" },
];

// TEXTUAL de los chats donde el asesor pasó la cuenta del Itaú.
const CHARLA_ITAU = [
  { role: "assistant", content: "$2000 de seña banco ITAU" },
  { role: "assistant", content: "Nro.5022900 EVERBOX S.A cuenta corriente en $" },
];

test("pasar la cuenta de Abitab es contexto de pago", () => {
  assert.equal(huboContextoDePago(CHARLA_ABITAB), true);
});

test("pasar la cuenta del Itaú es contexto de pago", () => {
  assert.equal(huboContextoDePago(CHARLA_ITAU), true);
});

test("una charla de venta normal NO es contexto de pago", () => {
  assert.equal(huboContextoDePago([
    { role: "user", content: "Hola, quiero un presupuesto" },
    { role: "assistant", content: "¿Para qué vehículo es? Contame marca y modelo." },
    { role: "user", content: "Volvo 460 del año 96" },
    { role: "assistant", content: "Ese cubreasiento lo confeccionamos a medida para tu vehículo." },
  ]), false);
});

test("hablar de medios de pago sin dar la cuenta NO alcanza", () => {
  // Si esto disparara, cada foto de un auto mandada después de "te paso los
  // medios de pago" entraría al panel como una transferencia que no existió.
  assert.equal(huboContextoDePago([
    { role: "assistant", content: "Una vez que me digas cómo querés recibirla, te paso los medios de pago. ¿Envío o retiro?" },
  ]), false);
});

test("que lo escriba el CLIENTE no cuenta: la cuenta la pasa el negocio", () => {
  assert.equal(huboContextoDePago([
    { role: "user", content: "me pasás el everbox así transfiero?" },
  ]), false);
});

test("sin mensajes no rompe", () => {
  assert.equal(huboContextoDePago([]), false);
  assert.equal(huboContextoDePago(), false);
});

// ── La red de seguridad con el disparador externo ────────────────────────────
import { armarAvisos } from "./avisos_equipo.js";

test("un comprobante en chat tomado se registra y se avisa", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({
    acciones: [],
    contacto: { nombre: "Ricardo", tel: "095420855" },
    texto: "",
    chatId: "59895420855",
    comprobanteExterno: "Comprobante en un chat que tomó un asesor (foto, cuenta recién pasada)",
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
    contacto: {},
    texto: "ahí va la seña",
    chatId: "59895420855",
    comprobanteExterno: "Comprobante en un chat que tomó un asesor",
  });
  assert.match(transferenciaSinRegistrar.detalle, /chat que tomó un asesor/);
  assert.match(transferenciaSinRegistrar.detalle, /ahí va la seña/);
});
