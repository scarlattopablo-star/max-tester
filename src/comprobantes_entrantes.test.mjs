// El comprobante del banco llega casi siempre como PDF ADJUNTO. Si el transporte
// no contempla ese tipo de mensaje, el cliente manda el comprobante y no pasa
// NADA: Max ni contesta, no queda registrado y el equipo no se entera.
// Pasó de verdad: Baileys manejaba los documentos, la Cloud API de Meta NO
// (caían en "otros tipos" y se ignoraban EN SILENCIO).
import test from "node:test";
import assert from "node:assert/strict";
import { notaDocumento, esPdf } from "./ws_mensaje.js";
import { TIPOS_QUE_ATIENDE } from "./whatsapp_meta.js";

// Todo tipo de mensaje con el que un cliente puede mandar un comprobante o pedir
// algo. Si mañana alguien agrega un transporte nuevo, este test lo obliga.
const TIPOS_QUE_TRAEN_PLATA = ["text", "image", "document"];

test("COBERTURA: la Cloud API atiende todo tipo de mensaje que puede traer un comprobante", () => {
  for (const tipo of TIPOS_QUE_TRAEN_PLATA) {
    assert.ok(
      TIPOS_QUE_ATIENDE.includes(tipo),
      `el transporte de Meta ignora los mensajes de tipo "${tipo}" — un comprobante ahí se pierde en silencio`,
    );
  }
});

test("un PDF adjunto se reconoce por mime o por extensión", () => {
  assert.ok(esPdf({ mime: "application/pdf" }));
  assert.ok(esPdf({ nombre: "comprobante.PDF" }));
  assert.ok(esPdf({ nombre: "transferencia.pdf", mime: "" }));
  assert.ok(!esPdf({ nombre: "foto.jpg", mime: "image/jpeg" }));
  assert.ok(!esPdf({}));
});

test("documento LEGIBLE: le pide al cerebro que saque el importe y registre", () => {
  const nota = notaDocumento({ nombre: "comprobante.pdf", mime: "application/pdf", legible: true });
  assert.match(nota, /comprobante\.pdf/);
  assert.match(nota, /LO TENÉS ADJUNTO/);
  assert.match(nota, /confirmar_transferencia/);
  assert.match(nota, /comprobante=true/);
  assert.match(nota, /IMPORTE/);
  assert.match(nota, /NO digas que el pago ya llegó/);
});

test("documento NO legible: registra igual, sin inventar monto", () => {
  const nota = notaDocumento({ nombre: "recibo.docx", mime: "application/msword", legible: false });
  assert.match(nota, /No podés abrirlo/);
  assert.match(nota, /confirmar_transferencia/);
  assert.match(nota, /comprobante=true/);
});

test("la nota nunca sale vacía aunque el archivo venga sin nombre ni mime", () => {
  const nota = notaDocumento({});
  assert.ok(nota.length > 40);
  assert.match(nota, /confirmar_transferencia/);
});
