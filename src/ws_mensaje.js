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
    // Documentos (PDF, etc.) con caption: típico COMPROBANTE de transferencia.
    m.documentMessage?.caption ||
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

// Documento adjunto (PDF, etc.), ya desenvuelto. Los clientes mandan el COMPROBANTE
// de la transferencia muchas veces como PDF del banco: antes caía en la rama de
// "mensaje no legible" y Max contestaba "no me llegó bien tu mensaje" — el aviso al
// equipo no salía nunca. Devuelve { nombre, mime, bytes } o null si no hay documento.
export function documentoDelMensaje(msg) {
  const d = contenidoReal(msg?.message)?.documentMessage;
  if (!d) return null;
  return { nombre: d.fileName || "", mime: d.mimetype || "", bytes: Number(d.fileLength) || 0 };
}

// ¿El cliente dice (EN PASADO) que YA hizo la transferencia / mandó el comprobante?
// Red de seguridad de los avisos al equipo: si el modelo no llama a la herramienta
// confirmar_transferencia, whatsapp.js registra y avisa igual por código.
// Calibrado con frases REALES de las conversaciones de producción. A propósito NO
// matchea promesas a futuro ("ya te transfiero", "en un rato te giro la seña",
// "cuando pueda hago el giro"): solo pasado inequívoco.
// El texto se NORMALIZA antes (minúsculas y sin tildes): la regex va sin acentos.
// Ojo: el \b de JS no funciona después de una vocal acentuada (\w es solo ASCII),
// por eso NO se evalúa sobre el texto crudo.
const RE_YA_TRANSFIRIO = new RegExp(
  [
    // "ya transferí / ya te giré / recién deposité / listo, envié"
    /\b(?:ya|recien|ahi|listo,?)\s+(?:te\s+|le\s+|les\s+)?(?:trans?feri|gire|deposite|envie)\b/,
    // "te transferí" (pasado, sin el "ya")
    /\bte\s+trans?feri\b/,
    // "hice la transferencia / el depósito / el giro" · "quedó el depósito hecho"
    /\bhice\s+(?:la|el)\s+(?:trans?ferencia|deposito|giro|pago)\b/,
    /\bdeposito\s+h?echo\b/,
    // "te pasé (el) comprobante / la transferencia / la seña" · "ya te pasé los 4000"
    /\b(?:te|les?)\s+pase\s+(?:(?:el|la)\s+)?(?:comprobante|trans?ferencia|sena)\b/,
    /\bya\s+te\s+pase\s+(?:los?|las?)\s+\$?\d/,
    // "ahí va / te mando / te paso el comprobante" (lo está mandando en ese momento)
    /\bahi\s+(?:va|te\s+va|te\s+mando|te\s+paso|te\s+pase)\s+el\s+comprobante\b/,
    // "transferencia hecha / realizada / enviada" · "ya transferencia" (telegráfico real)
    /\btrans?ferencia\s+(?:hecha|realizada|pronta|enviada)\b/,
    /\bya\s+trans?ferencia\b/,
  ].map((r) => r.source).join("|"),
  "i",
);

export function dijoQueTransfirio(texto) {
  const plano = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/g, "n");
  return RE_YA_TRANSFIRIO.test(plano);
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
