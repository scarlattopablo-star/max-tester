// EL ADJUNTO QUE LLEGA CON EL CHAT TOMADO POR UN ASESOR.
//
// Cuando un asesor toma la conversación, Max no contesta (eso está bien). Pero
// hasta el 21 sep 2026 tampoco GUARDABA el archivo: dejaba "[foto]" o "[mensaje]"
// en el historial y tiraba el adjunto. Un comprobante que llegaba en ese momento
// se perdía entero — no quedaba en el visor ni lo encontraba la auditoría de
// /api/comprobantes-perdidos. En un solo día se fueron 30 adjuntos en 13 chats, y
// el PDF del banco (como llega la mayoría de los comprobantes) caía en "[mensaje]".
//
// Lo que se fija acá: con el chat pausado, el mensaje queda con el MISMO marcador
// que en el camino normal, así el visor y la auditoría lo ven igual.
import test from "node:test";
import assert from "node:assert/strict";
import { marcaAdjuntoPausado } from "./whatsapp_meta.js";

test("una FOTO guardada queda con el marcador de siempre, no como [foto]", () => {
  const marca = marcaAdjuntoPausado({ tipo: "image", texto: "", id: 861 });
  assert.equal(marca, "[comprobante #861]");
});

test("un PDF del banco queda como comprobante-pdf, no como [mensaje]", () => {
  const marca = marcaAdjuntoPausado({ tipo: "document", texto: "", id: 902, esPdfDoc: true });
  assert.equal(marca, "[comprobante-pdf #902]");
});

test("si el cliente escribió algo junto al adjunto, el texto no se pierde", () => {
  const marca = marcaAdjuntoPausado({ tipo: "image", texto: "ahí va el comprobante", id: 861 });
  assert.equal(marca, "ahí va el comprobante [comprobante #861]");
});

test("si NO se pudo guardar, queda el cartel de siempre (nunca un mensaje vacío)", () => {
  assert.equal(marcaAdjuntoPausado({ tipo: "image", texto: "", id: null }), "[foto]");
  assert.equal(marcaAdjuntoPausado({ tipo: "audio", texto: "", id: null }), "[audio]");
  assert.equal(marcaAdjuntoPausado({ tipo: "text", texto: "", id: null }), "[mensaje]");
  assert.equal(
    marcaAdjuntoPausado({ tipo: "document", texto: "", id: null, notaDoc: "[documento: recibo.pdf]" }),
    "[documento: recibo.pdf]",
  );
});

test("un mensaje de texto normal pasa tal cual", () => {
  assert.equal(marcaAdjuntoPausado({ tipo: "text", texto: "gracias!" }), "gracias!");
});

test("el marcador es EL MISMO que busca la auditoría de comprobantes perdidos", () => {
  // /api/comprobantes-perdidos y el visor buscan "comprobante #N". Si acá se
  // escribiera distinto, el archivo se guardaría pero nadie lo encontraría.
  const marca = marcaAdjuntoPausado({ tipo: "image", texto: "", id: 861 });
  assert.match(marca, /comprobante #\d+/);
});
