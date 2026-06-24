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
// un remoteJid "@lid", que NO sirve para enviar: Baileys no entrega la respuesta y el
// cliente no recibe NADA (por eso Max contestaba a todos MENOS a los de los anuncios).
// El número real viene en senderPn → respondemos a "<numero>@s.whatsapp.net".
// Ver issues Baileys #1718 / #1832 (mismatch @lid ↔ @s.whatsapp.net).
export function jidParaResponder(msg, jid) {
  if (!String(jid).includes("@lid")) return jid; // jid normal: respondemos ahí mismo
  const tel = telDeMsg(msg, jid); // número real del cliente sacado del mensaje
  return tel ? `${tel}@s.whatsapp.net` : jid; // sin número no hay alternativa al @lid
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
