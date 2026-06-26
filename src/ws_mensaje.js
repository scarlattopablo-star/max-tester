// Helpers puros para interpretar los mensajes entrantes de WhatsApp (Baileys).
// Están acá (y no embebidos en whatsapp.js) para poder testearlos sin levantar el bot.

// Algunos mensajes vienen ENVUELTOS en un contenedor y el contenido real está adentro:
// mensajes que se autodestruyen (ephemeralMessage), "ver una vez" (viewOnce*),
// documentos con caption (documentWithCaptionMessage) y mensajes editados.
// Si no los desenvolvemos, el texto sale vacío y el mensaje se descarta en silencio
// — eso pasaba con varios mensajes que llegan desde los anuncios (Click-to-WhatsApp).
export function contenidoReal(message) {
  let m = message || {};
  for (let i = 0; i < 5; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message ||
      m.protocolMessage?.editedMessage;
    if (!inner) break;
    m = inner;
  }
  return m || {};
}

// Texto del mensaje, ya desenvuelto. Soporta texto plano, texto extendido (el que
// usan los mensajes con contexto, como los de anuncios), captions de foto/video y
// además los formatos INTERACTIVOS (botones, listas, plantillas y respuestas
// interactivas). Sin estos últimos, esos mensajes salían vacíos y Max los ignoraba
// —los lee el bot Sofi de Buda, por eso a veces "contestaba más" que Max—. Ahora
// Max reconoce los mismos formatos.
export function textoDelMensaje(msg) {
  const m = contenidoReal(msg?.message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    // Plantillas (template messages) con texto ya "hidratado".
    m.templateMessage?.hydratedTemplate?.hydratedContentText ||
    m.templateMessage?.hydratedFourRowTemplate?.hydratedContentText ||
    // El cliente tocó un BOTÓN: tomamos el texto del botón elegido.
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    // El cliente eligió una opción de una LISTA.
    m.listResponseMessage?.title ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    // Respuesta de un mensaje INTERACTIVO (nuevo formato de WhatsApp).
    m.interactiveResponseMessage?.body?.text ||
    ""
  ).trim();
}

// Teléfono REAL del cliente para armar el link wa.me y para responder a los chats
// "@lid". Con el nuevo direccionamiento de WhatsApp el remoteJid puede ser un "@lid"
// (que NO es el número); el número real viene en senderPn/participantPn/participant.
export function telDeMsg(msg, jid) {
  const fuentes = [
    msg?.key?.senderPn,
    msg?.key?.participantPn,
    msg?.key?.remoteJidAlt,
    msg?.key?.participant,
    jid,
  ];
  for (const f of fuentes) {
    const s = String(f || "");
    if (!s || s.includes("@lid")) continue; // @lid no es teléfono
    const d = s.split(/[:@]/)[0].replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 15) return d;
  }
  return "";
}

// JID al que hay que RESPONDER. Los que hacen clic en un anuncio de Instagram/Facebook
// (y, en general, los desconocidos con el nuevo direccionamiento de WhatsApp) llegan con
// un remoteJid "@lid".
//
// IMPORTANTE: hay que responder AL JID ORIGINAL TAL CUAL (incluido el "@lid"). Baileys
// rutea el @lid internamente y la respuesta SÍ se entrega. Reescribir el @lid a
// "<numero>@s.whatsapp.net" era un ERROR: con el nuevo direccionamiento el @lid y el
// número son identidades DISTINTAS, y enviar al @s.whatsapp.net de alguien que escribió
// por @lid NO se entrega → el cliente del anuncio no recibía nada.
// Referencia probada en producción: el bot "Sofi" de BUDA responde al jid original
// (msg.key.remoteJid) sin reescribirlo y contesta perfecto a los mensajes de anuncios.
// El número real (senderPn) se sigue usando aparte para el link wa.me de los avisos.
export function jidParaResponder(_msg, jid) {
  return jid; // responder donde llegó: Baileys maneja el @lid internamente
}

// Detecta los mensajes que llegan desde un anuncio de Instagram/Facebook
// (Click-to-WhatsApp): traen un externalAdReply dentro del contextInfo. Devuelve los
// datos del anuncio (título/cuerpo/fuente) o null si no es un mensaje de anuncio.
export function anuncioDelMensaje(msg) {
  const m = contenidoReal(msg?.message);
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    null;
  const ad = ctx?.externalAdReply;
  if (!ad) return null;
  return {
    titulo: ad.title || "",
    cuerpo: ad.body || "",
    fuente: ad.sourceUrl || ad.sourceId || ad.sourceType || "",
  };
}
