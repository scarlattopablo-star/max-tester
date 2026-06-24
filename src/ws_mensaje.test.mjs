// Test de los helpers de mensajes entrantes. Correr: node src/ws_mensaje.test.mjs
import assert from "node:assert/strict";
import { contenidoReal, textoDelMensaje, anuncioDelMensaje } from "./ws_mensaje.js";

let ok = 0;
function test(nombre, fn) { fn(); ok++; console.log(`  ✓ ${nombre}`); }

// 1) Texto plano normal.
test("texto plano", () => {
  const msg = { message: { conversation: "hola" } };
  assert.equal(textoDelMensaje(msg), "hola");
  assert.equal(anuncioDelMensaje(msg), null);
});

// 2) Mensaje desde un anuncio Click-to-WhatsApp (Instagram). Es el caso del reclamo:
//    "¡Hola! Quiero más información." con externalAdReply.
test("mensaje de anuncio (CTWA) — extrae texto y detecta el anuncio", () => {
  const msg = {
    message: {
      extendedTextMessage: {
        text: "¡Hola! Quiero más información.",
        contextInfo: {
          externalAdReply: {
            title: "La casa del cubreasiento",
            body: "Alfombras 3D",
            sourceUrl: "https://instagram.com/lacasadelcubreasiento",
          },
        },
      },
    },
  };
  assert.equal(textoDelMensaje(msg), "¡Hola! Quiero más información.");
  const ad = anuncioDelMensaje(msg);
  assert.ok(ad, "debería detectar el anuncio");
  assert.equal(ad.titulo, "La casa del cubreasiento");
  assert.equal(ad.fuente, "https://instagram.com/lacasadelcubreasiento");
});

// 3) Mensaje ENVUELTO (efímero/autodestructivo): antes salía vacío y se ignoraba.
test("mensaje efímero — se desenvuelve y extrae el texto", () => {
  const msg = { message: { ephemeralMessage: { message: { extendedTextMessage: { text: "info por favor" } } } } };
  assert.equal(textoDelMensaje(msg), "info por favor");
});

// 4) Anuncio ENVUELTO en efímero: combina los dos casos.
test("anuncio envuelto en efímero — detecta el anuncio igual", () => {
  const msg = {
    message: {
      ephemeralMessage: {
        message: {
          extendedTextMessage: {
            text: "Quiero más info",
            contextInfo: { externalAdReply: { title: "Anuncio FB", sourceId: "123" } },
          },
        },
      },
    },
  };
  assert.equal(textoDelMensaje(msg), "Quiero más info");
  assert.equal(anuncioDelMensaje(msg).titulo, "Anuncio FB");
});

// 5) Foto: detecta el imageMessage tras desenvolver.
test("foto envuelta en viewOnce — contenidoReal expone imageMessage", () => {
  const msg = { message: { viewOnceMessageV2: { message: { imageMessage: { caption: "mi auto", mimetype: "image/jpeg" } } } } };
  assert.ok(contenidoReal(msg.message).imageMessage);
  assert.equal(textoDelMensaje(msg), "mi auto");
});

console.log(`\n✅ ${ok} tests OK`);
