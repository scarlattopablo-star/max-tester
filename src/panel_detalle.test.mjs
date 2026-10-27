// Panel de transacciones (producción, 27 oct 2026):
//  1. el Detalle mostraba la nota interna de Max sobre el adjunto ("[El cliente te mandó
//     un archivo adjunto (…) y LO TENÉS ADJUNTO: leelo…]") con el link del PDF;
//  2. una foto de un pago por Mercado Pago registró una transferencia de $0 duplicada.
// Correr: node --test src/panel_detalle.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { textoParaPanel, esPagoMercadoPago, armarAvisos } from "./avisos_equipo.js";
import { notaDocumento } from "./ws_mensaje.js";

// Mismo formato que el caso real; el token es inventado.
const NOMBRE = "e-Ticket_CFE_INV_2026_0000001.pdf?access_token=TOKEN-DE-PRUEBA";

test("la nota del PDF pasa a 'Comprobante en PDF: archivo.pdf'", () => {
  const nota = notaDocumento({ nombre: NOMBRE, mime: "application/pdf", legible: true });
  assert.equal(textoParaPanel(nota), "Comprobante en PDF: e-Ticket_CFE_INV_2026_0000001.pdf");
  const ilegible = notaDocumento({ nombre: "foto.heic", mime: "image/heic", legible: false });
  assert.equal(textoParaPanel(ilegible), "Archivo adjunto: foto.heic");
});

test("el texto del cliente queda y la nota se va", () => {
  const nota = notaDocumento({ nombre: "comprobante.pdf", mime: "application/pdf", legible: true });
  assert.equal(textoParaPanel(`ahí te mando ${nota}`), "ahí te mando Comprobante en PDF: comprobante.pdf");
  assert.equal(textoParaPanel("ya transferí los 4410"), "ya transferí los 4410");
});

test("el registro de la red de seguridad sale sin la nota interna", () => {
  const nota = notaDocumento({ nombre: NOMBRE, mime: "application/pdf", legible: true });
  const { transferenciaSinRegistrar } = armarAvisos({ texto: nota, chatId: "59899000000", pdfRecibido: true, contacto: { nombre: "Cliente", tel: "59899000000" } });
  assert.ok(transferenciaSinRegistrar);
  assert.ok(!/LO TEN[EÉ]S|access_token|leelo/i.test(transferenciaSinRegistrar.detalle), transferenciaSinRegistrar.detalle);
  assert.match(transferenciaSinRegistrar.detalle, /Comprobante en PDF: e-Ticket/);
});

const MP_REAL = "¡Perfecto! Veo que ya pagaste por Mercado Pago la alfombra de tu Geely EX2 — $4.900. El pago ya está acreditado.";

test("foto de un pago por Mercado Pago: no se registra como transferencia", () => {
  assert.equal(esPagoMercadoPago(MP_REAL), true);
  const r = armarAvisos({ texto: "", chatId: "59899000001", fotoRecibida: true, respuestaMax: MP_REAL, contacto: {} });
  assert.equal(r.transferenciaSinRegistrar, null);
});

test("foto de una transferencia (aunque nombre Mercado Pago) se sigue registrando", () => {
  for (const resp of [
    "Vi el comprobante de la transferencia, le paso al equipo para que lo verifique.",
    "Veo la transferencia desde Mercado Pago por $4.410, el equipo la verifica.",
    "Vi el comprobante de Abitab. Le paso todo al equipo.",
  ]) {
    assert.equal(esPagoMercadoPago(resp), false, resp);
    const r = armarAvisos({ texto: "", chatId: "59899000002", fotoRecibida: true, respuestaMax: resp, contacto: {} });
    assert.ok(r.transferenciaSinRegistrar, resp);
  }
});
