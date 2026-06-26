// Test de los helpers de mensajes entrantes. Correr: node src/ws_mensaje.test.mjs
import assert from "node:assert/strict";
import { contenidoReal, textoDelMensaje, anuncioDelMensaje, telDeMsg, jidParaResponder } from "./ws_mensaje.js";

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

// 6) EL FIX CLAVE: un mensaje de anuncio llega como "@lid". Hay que responder al
//    JID ORIGINAL (el @lid TAL CUAL): Baileys lo rutea internamente y la respuesta SÍ
//    se entrega. Reescribirlo a @s.whatsapp.net NO se entregaba (identidades distintas).
//    El número real (senderPn) se sigue extrayendo aparte para el link wa.me del aviso.
//    Referencia probada: el bot Sofi de BUDA responde al jid original y anda perfecto.
test("@lid de anuncio → responde al @lid original (Baileys lo rutea)", () => {
  const msg = {
    key: { remoteJid: "215643897234567@lid", senderPn: "59898299523@s.whatsapp.net" },
    message: { extendedTextMessage: { text: "info", contextInfo: { externalAdReply: { title: "x" } } } },
  };
  assert.equal(telDeMsg(msg, msg.key.remoteJid), "59898299523"); // número para el link wa.me
  assert.equal(jidParaResponder(msg, msg.key.remoteJid), "215643897234567@lid"); // responder al @lid
});

// 7) Un chat normal (@s.whatsapp.net) NO se toca: se responde al mismo jid.
test("jid normal → se responde al mismo jid", () => {
  const jid = "59891629784@s.whatsapp.net";
  assert.equal(jidParaResponder({ key: { remoteJid: jid } }, jid), jid);
});

// 8) @lid sin número conocido: no hay alternativa, queda el @lid (no rompe).
test("@lid sin número → cae al @lid", () => {
  const jid = "215643897234567@lid";
  assert.equal(jidParaResponder({ key: { remoteJid: jid } }, jid), jid);
});

// 9) Formatos INTERACTIVOS que antes Max ignoraba (los lee Sofi): botón, lista,
//    plantilla y respuesta interactiva. Ahora textoDelMensaje los reconoce.
test("botón (buttonsResponseMessage) — lee el texto del botón", () => {
  const msg = { message: { buttonsResponseMessage: { selectedDisplayText: "Quiero comprar" } } };
  assert.equal(textoDelMensaje(msg), "Quiero comprar");
});
test("lista (listResponseMessage) — lee el título de la opción", () => {
  const msg = { message: { listResponseMessage: { title: "Cubreasientos a medida" } } };
  assert.equal(textoDelMensaje(msg), "Cubreasientos a medida");
});
test("plantilla (templateMessage hidratada) — lee el contenido", () => {
  const msg = { message: { templateMessage: { hydratedTemplate: { hydratedContentText: "Hola, info de alfombras" } } } };
  assert.equal(textoDelMensaje(msg), "Hola, info de alfombras");
});
test("respuesta interactiva — lee el body.text", () => {
  const msg = { message: { interactiveResponseMessage: { body: { text: "Opción A" } } } };
  assert.equal(textoDelMensaje(msg), "Opción A");
});

console.log(`\n✅ ${ok} tests OK`);
