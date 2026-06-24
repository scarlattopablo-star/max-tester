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
// usan los mensajes con contexto, como los de anuncios) y captions de foto/video.
export function textoDelMensaje(msg) {
  const m = contenidoReal(msg?.message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ""
  ).trim();
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
