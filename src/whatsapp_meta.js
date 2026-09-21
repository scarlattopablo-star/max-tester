// Transporte de WhatsApp por la CLOUD API OFICIAL de Meta (reemplazo de Baileys).
// En vez de un socket con QR, Meta nos manda los mensajes entrantes a un WEBHOOK
// (POST /webhook) y nosotros respondemos por HTTP (meta_api.js). El CEREBRO de Max
// (handler.js → cerebro.js) es el MISMO: este archivo es solo la cañería nueva.
//
// Se monta sobre el server web (web.js) con montarWebhook(app), cuando
// WA_PROVIDER=meta. Es el ÚNICO canal: Baileys se eliminó el 14 ago 2026.
import "./env.js";
import { procesarMensaje } from "./handler.js";
import { sleep, delayEscritura } from "./humano.js";
import { agregar, cargarConversaciones, historial } from "./memoria.js";
import { registrarMensajeMax } from "./metricas.js";
import { cargarEstado, esHumano, marcarHumano } from "./previas.js";
import { registrarTransporte } from "./notificador.js";
import { avisarAcciones, pideAtencionDelEquipo } from "./avisos_equipo.js";
import { esPdf, notaDocumento, dijoQueTransfirio, huboContextoDePago } from "./ws_mensaje.js";
import { guardarComprobanteDataUri } from "./comprobantes.js";
import { registrarCliente } from "./clientes.js";
import { recordarEnviado, marcaDeCita } from "./citas.js";
import { diag } from "./diag.js";
import { recordarEnvio as recordarAvisoEquipo, marcarEntregado as avisoEntregado, marcarRebote as avisoRebotado } from "./avisos_salud.js";
import {
  enviarTextoMeta, enviarImagenMeta, enviarVideoMeta, enviarPlantillaMeta,
  marcarLeidoEscribiendo, mediaComoDataUri, aWaId, metaConfigurado,
} from "./meta_api.js";

const VENTANA_MS = 3500; // junta mensajes seguidos del cliente y responde UNA vez
const PDF_MAX_BYTES = 5 * 1024 * 1024; // los comprobantes pesan pocos KB
// Tipos de mensaje entrante que Max ATIENDE. Los que no están acá se ignoran en
// silencio, así que agregar uno es una decisión consciente: un comprobante que
// llegue en un tipo no contemplado se pierde entero (pasó con "document").
export const TIPOS_QUE_ATIENDE = Object.freeze(["text", "image", "document", "audio"]);
const buffers = new Map(); // tel -> { textos:[], imagenes:[], timer, contacto, ctxAnuncio }
const procesando = new Set();
const idsVistos = new Set(); // anti-duplicados (Meta puede reentregar el webhook)
const enviadosPorMax = new Set(); // ids de mensajes que mandó Max (para no confundir el eco en coexistence)
let ultimaConfirmacionAvisos = 0; // para confirmar el canal de avisos a lo sumo cada 12 h

// Número propio (el 091 dentro de la WABA): en coexistence, los mensajes que el
// equipo manda desde la app del celular también llegan al webhook con from = este
// número. Los usamos para pausar a Max (handoff humano).
function numeroPropio() {
  return aWaId(process.env.NUMERO_BOT || process.env.NUMERO_AVISOS || "");
}

// CHAT QUE TOMÓ UN ASESOR: Max no contesta, pero el ADJUNTO se guarda igual.
//
// Hasta el 21 sep 2026 en un chat pausado se guardaba SOLO el cartel "[foto]" o
// "[mensaje]" y el archivo se descartaba. Un comprobante que llegaba con el chat
// tomado se perdía entero: no quedaba en el visor, no lo encontraba la auditoría
// de /api/comprobantes-perdidos y no había forma de recuperarlo desde acá. En un
// solo día (21 sep) se fueron así 30 adjuntos en 13 chats — y el PDF del banco,
// que es como llega la mayoría de los comprobantes, caía en "[mensaje]".
//
// Parte PURA: con qué texto queda el mensaje en el historial. `id` es el del
// archivo ya guardado (null si no se pudo). Devuelve el MISMO marcador que usa el
// camino normal, así el visor y la auditoría lo ven igual.
export function marcaAdjuntoPausado({ tipo, texto = "", id = null, esPdfDoc = false, notaDoc = "" }) {
  const partes = [String(texto || "").trim()];
  if (id) partes.push(esPdfDoc ? `[comprobante-pdf #${id}]` : `[comprobante #${id}]`);
  else if (tipo === "image") partes.push("[foto]");
  else if (tipo === "document") partes.push(notaDoc || "[documento]");
  else if (tipo === "audio") partes.push("[audio]");
  else if (!partes[0]) partes.push("[mensaje]");
  return partes.filter(Boolean).join(" ");
}

// Parte con I/O: baja el adjunto y lo guarda. Nunca rompe el flujo: si falla,
// devuelve el marcador de siempre y el mensaje igual queda en el historial.
async function guardarAdjuntoPausado(tel, msg) {
  const tipo = msg.type;
  const texto = msg.text?.body || msg.image?.caption || msg.document?.caption || "";
  const doc = { nombre: msg.document?.filename || "", mime: msg.document?.mime_type || "" };
  const esPdfDoc = tipo === "document" && esPdf(doc);
  let dataUri = null;
  try {
    if (tipo === "image" && msg.image?.id) {
      dataUri = await mediaComoDataUri(msg.image.id);
    } else if (esPdfDoc && msg.document?.id && Number(msg.document?.file_size || 0) <= PDF_MAX_BYTES) {
      dataUri = await mediaComoDataUri(msg.document.id);
    }
  } catch (e) {
    console.log(`⚠ chat pausado ${tel}: no pude bajar el adjunto: ${e.message}`);
  }
  let id = null;
  if (dataUri) {
    try { id = await guardarComprobanteDataUri(tel, dataUri); }
    catch (e) { console.log(`⚠ chat pausado ${tel}: no pude guardar el adjunto: ${e.message}`); }
  }
  if (id) {
    diag("adjunto_guardado_en_pausa", { jid: tel, detalle: `${esPdfDoc ? "pdf" : "foto"} #${id}` });
    console.log(`📎 chat pausado ${tel}: adjunto guardado (#${id}) — Max no contesta, pero no se pierde`);
  } else if (tipo === "image" || tipo === "document") {
    diag("adjunto_perdido_en_pausa", { jid: tel, detalle: tipo });
    console.log(`⚠ chat pausado ${tel}: adjunto de tipo ${tipo} NO se pudo guardar`);
  }
  return marcaAdjuntoPausado({
    tipo, texto, id, esPdfDoc,
    notaDoc: tipo === "document" ? notaDocumento({ ...doc, legible: !!id }) : "",
  });
}

// Un chat que tomó un asesor TAMBIÉN tiene que registrar la plata que entra.
// Guardar el archivo (guardarAdjuntoPausado) evita perderlo, pero sin esto la
// transferencia no aparece sola en /admin: `avisarAcciones` no corre porque Max
// sale antes de razonar.
//
// Acá Max no piensa, así que no hay respuesta suya donde leer "vi el
// comprobante". Quedan tres señales determinísticas:
//   · un PDF          → el comprobante del banco es un PDF y casi nada más lo es;
//   · el cliente ESCRIBIÓ que transfirió;
//   · una FOTO y el negocio acaba de pasar los datos de la cuenta en esa charla.
// La tercera es la que importa y la que hay que mantener ajustada: una foto sola
// no dice si es un pago o el asiento del auto. Medido sobre el 21 sep 2026, el
// contexto deja 7 de 23 fotos (4 chats), y entre ellas está el Abitab de $1.000
// que se perdió.
const pagosEnPausa = new Map(); // tel -> ts del último registro
const PAUSA_DEDUP_MS = 15 * 60 * 1000; // un chat mandó 3 fotos del mismo pago

async function registrarPagoEnChatTomado(tel, msg, nombre) {
  const texto = msg.text?.body || msg.image?.caption || msg.document?.caption || "";
  const esFoto = msg.type === "image";
  const esPdfDoc = msg.type === "document"
    && esPdf({ nombre: msg.document?.filename || "", mime: msg.document?.mime_type || "" });
  const loEscribio = dijoQueTransfirio(texto);
  // Los 11 últimos = los 10 previos más el mensaje que se acaba de guardar.
  const porContexto = esFoto && huboContextoDePago((historial(tel) || []).slice(-11));
  if (!esPdfDoc && !loEscribio && !porContexto) return;

  if (Date.now() - (pagosEnPausa.get(tel) || 0) < PAUSA_DEDUP_MS) {
    console.log(`🏦 chat pausado ${tel}: otro comprobante dentro de los 15 min, ya estaba registrado`);
    return;
  }
  pagosEnPausa.set(tel, Date.now());

  const motivo = esPdfDoc ? "PDF del banco"
    : loEscribio ? "el cliente escribió que transfirió"
    : "foto, con la cuenta recién pasada";
  diag("pago_en_chat_tomado", { jid: tel, detalle: motivo });
  console.log(`🏦 chat pausado ${tel}: comprobante detectado (${motivo}) — se registra igual`);
  try {
    await avisarAcciones({
      acciones: [], contacto: { nombre, tel }, texto, chatId: tel,
      comprobanteExterno: `Comprobante en un chat que tomó un asesor (${motivo})`,
      fallbackConversacion: "Buscá la conversación en la bandeja de Meta Business Suite.",
    });
  } catch (e) {
    console.log(`⚠ chat pausado ${tel}: no pude registrar el pago: ${e.message}`);
  }
}

// Manda UN aviso al equipo a un número. Sale por PLANTILLA (llega esté o no
// abierta la ventana de 24 h) y cae al texto libre si la plantilla falla.
// Devuelve el id del mensaje de Meta, que es con lo que después se lo puede atar
// al status del webhook (entregado o rebotado).
async function mandarAvisoA(destino, texto) {
  const plantilla = process.env.PLANTILLA_AVISO ?? "aviso_equipo_max";
  if (plantilla) {
    // Los parámetros de plantilla no admiten saltos de línea (regla de Meta).
    const plano = String(texto || "").replace(/\s+/g, " ").trim().slice(0, 1024);
    try {
      const r = await enviarPlantillaMeta(destino, plantilla, "es", [
        { type: "body", parameters: [{ type: "text", text: plano }] },
      ]);
      return r?.messages?.[0]?.id || "";
    } catch (e) {
      console.log(`⚠ aviso por plantilla "${plantilla}" falló (${e.message}) — reintento como texto libre`);
    }
  }
  const r = await enviarTextoMeta(destino, texto);
  return r?.messages?.[0]?.id || "";
}

// Un aviso al equipo que REBOTÓ. No es un mensaje perdido más: es el equipo
// quedándose sin derivaciones ni avisos de transferencia. Se grita en el log, se
// deja en /api/diag y se reintenta por NUMERO_AVISOS_RESPALDO.
// (18 sep 2026: el 096 empezó a rebotar todo con code 131026 y el equipo estuvo
// 3 días sin enterarse de nada porque el rebote no despertaba a nadie.)
async function rescatarAviso(rebote, destinoOriginal, detalle) {
  diag("aviso_equipo_rebotado", { jid: destinoOriginal, detalle: `${detalle} · ${rebote.consecutivos} seguidos` });
  console.log(`🚨 AVISO AL EQUIPO REBOTADO (${rebote.consecutivos} seguidos) — el equipo NO se está enterando. Destino ${destinoOriginal}: ${detalle}`);

  const respaldo = aWaId(process.env.NUMERO_AVISOS_RESPALDO || "");
  if (!respaldo || respaldo === aWaId(destinoOriginal)) {
    console.log(`🚨 Sin NUMERO_AVISOS_RESPALDO: este aviso se perdió → ${String(rebote.texto).replace(/\s+/g, " ").slice(0, 120)}`);
    return;
  }
  // El rescate NO se recuerda en avisos_salud: si el respaldo también rebota, el
  // status no dispara otro rescate y no se arma un ida y vuelta infinito.
  try {
    await mandarAvisoA(respaldo, `🚨 (rebotó al ${destinoOriginal})\n${rebote.texto}`);
    diag("aviso_equipo_rescatado", { jid: respaldo });
    console.log(`✅ aviso rescatado por el número de respaldo ${respaldo}`);
  } catch (e) {
    console.log(`🚨 el respaldo ${respaldo} TAMPOCO pudo: ${e.message} → ${String(rebote.texto).replace(/\s+/g, " ").slice(0, 120)}`);
  }
}

// caption: si el mensaje que se envió era una FOTO o un VIDEO de un producto, se
// recuerda cuál era, para poder resolver la cita cuando el cliente le responda.
function marcarEnviado(resp, caption = "") {
  const id = resp?.messages?.[0]?.id;
  if (!id) return;
  if (caption) recordarEnviado(id, caption);
  enviadosPorMax.add(id);
  if (enviadosPorMax.size > 500) {
    for (const v of enviadosPorMax) { enviadosPorMax.delete(v); if (enviadosPorMax.size <= 500) break; }
  }
}

// COEXISTENCE (número en la app del celular Y en la Cloud API a la vez):
// cuando un asesor responde a un cliente DESDE la app de WhatsApp Business, Meta
// nos avisa por el webhook `smb_message_echoes` → value.message_echoes[], con el
// cliente en el campo `to`. Ese es el handoff: pausamos a Max en ese chat 3 h para
// que no hable encima del asesor. (En "API pura", sin app, esto nunca dispara.)
// REQUISITO Meta: suscribir el campo `smb_message_echoes` en el panel de la app.
async function procesarEcoEquipo(echo) {
  const id = echo?.id;
  if (id) {
    if (idsVistos.has(id)) return;          // anti-duplicado (Meta reentrega)
    idsVistos.add(id);
    if (idsVistos.size > 4000) idsVistos.clear();
    if (enviadosPorMax.has(id)) return;     // por las dudas: no es un envío de Max por la API
  }
  // La sincronización de historial de Coexistence también entrega ECOS VIEJOS del
  // equipo (meses de respuestas desde la app). Solo un eco RECIENTE significa "un
  // asesor está atendiendo AHORA": los históricos no deben pausar a Max.
  const ts = parseInt(echo?.timestamp || "0", 10);
  if (ts && Date.now() / 1000 - ts > 600) return;
  const cliente = aWaId(echo?.to);          // a QUIÉN le escribió el asesor
  if (!cliente) return;
  await marcarHumano(cliente);              // Max se calla 3 h en ese chat
  const t = echo?.text?.body || (echo?.type ? `[${echo.type}]` : "[mensaje]");
  agregar(cliente, "assistant", t);         // guardar en el historial lo que escribió el asesor
  diag("handoff_equipo", { jid: cliente });
  console.log(`🧑 el equipo respondió a ${cliente} desde la app → Max en pausa 3 h`);
}

function encolar(tel, { texto, imagenes = [], contacto, msgId, pdf = false }) {
  const b = buffers.get(tel) || { textos: [], imagenes: [], timer: null, contacto: {}, msgId: null, pdf: false };
  if (texto) b.textos.push(texto);
  if (imagenes.length) b.imagenes.push(...imagenes);
  if (pdf) b.pdf = true; // llegó un comprobante: lo recuerda hasta que se procese el turno
  if (contacto) b.contacto = { ...b.contacto, ...contacto };
  if (msgId) b.msgId = msgId;
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => { b.timer = null; procesar(tel); }, VENTANA_MS);
  buffers.set(tel, b);
}

async function procesar(tel) {
  if (procesando.has(tel)) return;
  const b = buffers.get(tel);
  if (!b || (!b.textos.length && !b.imagenes.length)) return;

  const texto = b.textos.join("\n");
  const imagenes = b.imagenes;
  const contacto = b.contacto || {};
  const msgId = b.msgId;
  const pdfRecibido = !!b.pdf;
  b.textos = []; b.imagenes = []; b.pdf = false;
  procesando.add(tel);
  try {
    const { texto: respuesta, acciones, imagenesEnviar = [], videosEnviar = [] } =
      await procesarMensaje({ chatId: tel, texto, canal: "whatsapp", imagenes, contacto });

    // Si el cliente escribió MÁS mientras Max pensaba, reprocesamos con eso incluido.
    if (b.textos.length || b.imagenes.length) { procesando.delete(tel); return procesar(tel); }

    // ✓✓ leído + "escribiendo…" — SOLO si esta respuesta NO genera un aviso al
    // equipo. Cuando Max pide atención (derivación / venta / turno), el chat queda
    // SIN LEER a propósito: así el equipo lo encuentra resaltado en la bandeja
    // (antes Max lo marcaba leído y el aviso era imposible de ubicar). El costo es
    // que el "escribiendo…" arranca después de pensar, durante las pausas de tipeo.
    if (!pideAtencionDelEquipo(acciones, texto)) await marcarLeidoEscribiendo(msgId);

    // Envío HUMANO: la respuesta se parte en mensajitos (bloques separados por
    // línea en blanco) y cada uno sale con su pausa de tipeo, como chatea una
    // persona. Máximo 3 burbujas para no spammear.
    const partes = String(respuesta || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const burbujas = partes.length <= 3 ? partes : [...partes.slice(0, 2), partes.slice(2).join("\n\n")];
    for (const parte of (burbujas.length ? burbujas : [respuesta])) {
      await sleep(delayEscritura(parte));
      marcarEnviado(await enviarTextoMeta(tel, parte));
    }
    registrarMensajeMax(tel);

    for (const f of imagenesEnviar) {
      try {
        await sleep(900 + Math.floor(Math.random() * 900));
        marcarEnviado(await enviarImagenMeta(tel, f.url, f.caption || ""), f.caption || "");
      } catch (e) { console.log("⚠ no pude enviar foto:", e.message); }
    }
    for (const v of videosEnviar) {
      try {
        await sleep(900 + Math.floor(Math.random() * 900));
        marcarEnviado(await enviarVideoMeta(tel, v.url, v.caption || ""), v.caption || "");
      } catch (e) { console.log("⚠ no pude enviar video:", e.message); }
    }
    diag("respondido", { jid: tel, resumen: String(respuesta).slice(0, 80) });
    console.log(`📤 ${tel}: ${respuesta}` + (imagenesEnviar.length ? ` (+${imagenesEnviar.length} foto)` : ""));

    await avisarAcciones({
      acciones, contacto, texto, chatId: tel, pdfRecibido,
      // Para la red de seguridad: un comprobante fotografiado no es texto ni PDF,
      // así que se reconoce por lo que Max dijo que vio en la foto.
      fotoRecibida: imagenes.length > 0, respuestaMax: respuesta,
      fallbackConversacion: "Buscá la conversación en la bandeja de Meta Business Suite.",
    });
  } catch (e) {
    diag("error", { jid: tel, detalle: e.message });
    console.log(`⚠ Error respondiendo a ${tel}: ${e.message}`);
    try { marcarEnviado(await enviarTextoMeta(tel, "¡Perdón! Se me cruzó un cable 😅 ¿Me lo repetís?")); } catch {}
  } finally {
    procesando.delete(tel);
    const b2 = buffers.get(tel);
    if (b2 && (b2.textos.length || b2.imagenes.length)) procesar(tel);
  }
}

// Los avisos al equipo (derivación / venta / TRANSFERENCIA / turno) viven en
// avisos_equipo.js, compartidos con Baileys. Antes había acá una copia propia que
// se quedó sin el aviso de transferencias durante 3 semanas: no volver a duplicar.

// ── Parseo del webhook entrante de Meta ───────────────────────────────────────
// Extrae el contexto de un anuncio Click-to-WhatsApp (referral). Reemplaza todo el
// parche del @lid de Baileys: acá viene limpio en el primer mensaje del anuncio.
function ctxDeAnuncio(referral) {
  if (!referral) return null;
  const partes = [];
  if (referral.headline) partes.push(`sobre "${referral.headline}"`);
  if (referral.body) partes.push(`— ${referral.body}`);
  const desc = partes.length ? ` ${partes.join(" ")}` : "";
  return {
    titulo: referral.headline || "",
    fuente: referral.source_type || "",
    ctx: `[Contexto: el cliente llegó desde un anuncio de Instagram/Facebook${desc}. Orientá la respuesta a ese producto.] `,
  };
}

// Procesa UN mensaje entrante del webhook (objeto value.messages[i]).
async function procesarEntrante(msg, value) {
  const tel = aWaId(msg.from);
  const propio = numeroPropio();

  // Anti-duplicados: Meta puede reintentar el webhook.
  if (msg.id) {
    if (idsVistos.has(msg.id)) return;
    idsVistos.add(msg.id);
    if (idsVistos.size > 4000) idsVistos.clear();
  }

  // COEXISTENCE: la sincronización de historial (hasta 6 meses) puede entregar
  // mensajes VIEJOS por el webhook como si fueran nuevos. Igual que hacía Baileys
  // con arranqueTs, todo lo que tenga más de 10 minutos se ignora: responder
  // charlas de hace días/semanas confundiría a los clientes.
  const ts = parseInt(msg.timestamp || "0", 10);
  if (ts && Date.now() / 1000 - ts > 600) {
    diag("ignorado_viejo", { jid: tel, ts });
    console.log(`🕰️ ${tel}: mensaje viejo (sync de historial), ignorado`);
    return;
  }

  // COEXISTENCE: un mensaje con from = nuestro propio número es el EQUIPO escribiendo
  // desde la app del celular. Si no lo mandó Max por la API, es un humano → handoff.
  if (propio && tel === propio) {
    if (msg.id && enviadosPorMax.has(msg.id)) return; // eco de un envío de Max
    // El destinatario (cliente) en el eco viene en distintos campos según el caso;
    // si no lo tenemos, no podemos atar el handoff a una conversación: lo logueamos.
    console.log("🧑 mensaje del equipo desde la app (coexistence) — handoff");
    return;
  }

  // El NÚMERO DE AVISOS (el celular del asesor que recibe los avisos de Max) NO es
  // un cliente: no se le vende. Que le escriba a Max además ABRE la ventana de 24 h
  // que la Cloud API exige para entregarle los avisos como texto libre (fuera de esa
  // ventana Meta los descarta en silencio, code 131047). Le confirmamos el canal (a
  // lo sumo una vez cada 12 h) para que el equipo sepa que quedó activo.
  const numAvisos = aWaId(process.env.NUMERO_AVISOS || "");
  if (numAvisos && tel === numAvisos) {
    console.log("🔔 mensaje del número de avisos → ventana de 24 h abierta para los avisos");
    diag("canal_avisos_abierto", { jid: tel });
    if (Date.now() - ultimaConfirmacionAvisos > 12 * 3600_000) {
      ultimaConfirmacionAvisos = Date.now();
      try {
        marcarEnviado(await enviarTextoMeta(tel,
          "✅ Canal de avisos activo: los avisos de Max (derivaciones, ventas y turnos) llegan a este número.\n\nOJO: WhatsApp cierra el canal si pasan 24 h sin que me escribas. Un mensaje cualquiera por día (un \"ok\") lo mantiene abierto."));
      } catch (e) { console.log("⚠ no pude confirmar el canal de avisos:", e.message); }
    }
    return;
  }

  // Nombre del cliente (viene en value.contacts).
  const perfil = (value.contacts || []).find((c) => aWaId(c.wa_id) === tel);
  const nombre = perfil?.profile?.name || "";

  // ¿Vino desde un anuncio? (primer mensaje del Click-to-WhatsApp)
  const anuncio = ctxDeAnuncio(msg.referral);
  if (anuncio) console.log(`📣 ${tel}: desde ANUNCIO${anuncio.titulo ? ` ("${anuncio.titulo}")` : ""}`);

  // Registrar/actualizar el cliente en nuestra base propia (agenda + segmentación).
  registrarCliente({ telefono: tel, nombre, origen: anuncio ? (anuncio.titulo || anuncio.fuente || "anuncio") : "" });

  // ¿Un asesor ya tomó esta conversación? Max no participa, pero guarda en memoria.
  if (esHumano(tel)) {
    // Max no participa, PERO el adjunto se guarda: un comprobante que llega con el
    // chat tomado por un asesor tiene que quedar igual (ver guardarAdjuntoPausado).
    agregar(tel, "user", await guardarAdjuntoPausado(tel, msg));
    diag("pausado_humano", { jid: tel, anuncio: !!anuncio });
    console.log(`🤫 conversación de un asesor en ${tel}: Max no participa`);
    // Max no contesta, pero si entró plata tiene que quedar en /admin igual.
    await registrarPagoEnChatTomado(tel, msg, nombre);
    return;
  }

  const contacto = { nombre, tel };

  // ¿Está RESPONDIENDO a un mensaje nuestro? La Cloud API manda el id del citado en
  // `context.id`. Es la forma natural de elegir entre varias fotos ("Este me gusta"),
  // y hasta el 7 ago 2026 la ignorábamos: Max tenía que adivinar cuál era y adivinó
  // mal (le cobró el eco cuero liso a quien había elegido el capitoneado ocre).
  const cita = marcaDeCita(msg.context?.id);

  // ── Según el tipo de mensaje ──
  if (msg.type === "text") {
    let texto = cita + (msg.text?.body || "");
    if (anuncio) texto = anuncio.ctx + (texto || "Hola, vengo del anuncio y quiero más información.");
    diag("recibido", { jid: tel, anuncio: anuncio ? (anuncio.fuente || anuncio.titulo || "sí") : null, tieneTexto: !!texto, tieneFoto: false, tel });
    console.log(`📩 ${tel}: ${texto}`);
    encolar(tel, { texto, contacto, msgId: msg.id });
    return;
  }

  if (msg.type === "image") {
    const dataUri = msg.image?.id ? await mediaComoDataUri(msg.image.id) : null;
    let texto = cita + (msg.image?.caption || "");
    if (anuncio) texto = anuncio.ctx + texto;
    diag("recibido", { jid: tel, anuncio: !!anuncio, tieneTexto: !!texto, tieneFoto: true, tel });
    console.log(`📩 ${tel}: [foto]${texto ? " " + texto : ""}`);
    encolar(tel, { texto, imagenes: dataUri ? [dataUri] : [], contacto, msgId: msg.id });
    return;
  }

  // DOCUMENTO adjunto (PDF del banco, casi siempre el COMPROBANTE de una
  // transferencia). Hasta el 14 ago 2026 este tipo NO estaba contemplado acá y
  // caía en "otros tipos": se ignoraba EN SILENCIO. El cliente mandaba el
  // comprobante y no pasaba nada — ni respuesta, ni registro, ni aviso al equipo.
  if (msg.type === "document") {
    const doc = { nombre: msg.document?.filename || "", mime: msg.document?.mime_type || "" };
    const grande = Number(msg.document?.file_size || 0) > PDF_MAX_BYTES;
    const dataUri = (esPdf(doc) && !grande && msg.document?.id) ? await mediaComoDataUri(msg.document.id) : null;
    const nota = notaDocumento({ ...doc, legible: !!dataUri });
    const texto = cita + [msg.document?.caption || "", nota].filter(Boolean).join("\n");
    diag("recibido", { jid: tel, anuncio: !!anuncio, tieneTexto: true, tieneDocumento: true, tel });
    console.log(`📎 ${tel}: documento${doc.nombre ? ` "${doc.nombre}"` : ""}${dataUri ? " (PDF legible para el cerebro)" : ""}`);
    encolar(tel, { texto, imagenes: dataUri ? [dataUri] : [], contacto, msgId: msg.id, pdf: esPdf(doc) });
    return;
  }

  if (msg.type === "audio") {
    // Max no procesa audios: pedimos que lo escriban (igual que en Baileys).
    try {
      await marcarLeidoEscribiendo(msg.id);
      const aviso = "¡Hola! Por ahora no puedo escuchar audios 🙏 ¿Me lo podés escribir en un mensajito? Así te ayudo enseguida.";
      await sleep(800);
      marcarEnviado(await enviarTextoMeta(tel, aviso));
      registrarMensajeMax(tel);
      agregar(tel, "user", "[el cliente mandó un audio]");
      agregar(tel, "assistant", aviso);
      console.log(`🎤 ${tel}: audio → le pedí que lo escriba`);
    } catch (e) { console.log("⚠ no pude responder al audio:", e.message); }
    return;
  }

  // Si un tipo que DECIMOS atender llegó hasta acá, es un bug nuestro: le falta la
  // rama de arriba y el mensaje se estaría tirando. Que se vea fuerte en el log y
  // en /api/diag en vez de perderse (así se perdían los comprobantes en PDF).
  if (TIPOS_QUE_ATIENDE.includes(msg.type)) {
    diag("tipo_sin_rama", { jid: tel, formato: msg.type });
    console.log(`🚨 BUG: "${msg.type}" figura en TIPOS_QUE_ATIENDE pero no tiene rama — mensaje de ${tel} PERDIDO`);
  }

  // Otros tipos (sticker, ubicación, contacto, etc.): si vino de un anuncio sin
  // cuerpo, lo tratamos como apertura; si no, lo ignoramos en silencio.
  if (anuncio) {
    encolar(tel, { texto: anuncio.ctx + "Hola, vengo del anuncio y quiero más información.", contacto, msgId: msg.id });
  } else {
    diag("ignorado_sin_texto", { jid: tel, formato: msg.type || "?" });
    console.log(`(ignorado ${tel}: tipo ${msg.type})`);
  }
}

// ── Montaje del webhook sobre el server express (web.js) ──────────────────────
export function montarWebhook(app) {
  if (!metaConfigurado()) {
    console.log("⚠ WA_PROVIDER=meta pero faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_ID — el webhook NO se monta.");
    return;
  }

  // Cargar estado (handoff) y memoria (igual que hace Baileys al arrancar).
  cargarEstado();
  cargarConversaciones();

  // Avisos al equipo (derivación/venta/TRANSFERENCIA/turno) salen por la Cloud API.
  // ⚠️ VENTANA DE 24 h: el texto libre SOLO se entrega si el número de avisos le
  // escribió a Max en las últimas 24 h; si no, Meta lo descarta EN SILENCIO (la API
  // acepta el envío y después llega un status "failed" code 131047 al webhook).
  // Por eso el aviso sale por PLANTILLA (UTILITY "aviso_equipo_max", creada 22 jul,
  // id 4573476226266094): llega SIEMPRE, haya o no ventana abierta. Si la plantilla
  // falla (aún no aprobada / sin fondos en 360dialog), caemos al texto libre, que
  // al menos llega con la ventana abierta. PLANTILLA_AVISO="" la desactiva.
  // ⚠️ El 200 de Meta NO significa entregado: el rebote llega DESPUÉS, por el
  // webhook de statuses. Por eso cada aviso se recuerda por su id (avisos_salud.js):
  // si rebota, ahí abajo se reintenta por el número de respaldo y queda la alarma.
  registrarTransporte(async (texto) => {
    const destino = process.env.NUMERO_AVISOS || "091629784";
    recordarAvisoEquipo(await mandarAvisoA(destino, texto), texto);
  });

  // 1) VERIFICACIÓN del webhook (Meta hace un GET cuando lo configurás).
  app.get("/webhook", (req, res) => {
    const modo = req.query["hub.mode"];
    const tokenRecibido = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (modo === "subscribe" && tokenRecibido === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log("✅ webhook de Meta verificado");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // 2) RECEPCIÓN de mensajes. Respondemos 200 ENSEGUIDA (Meta reintenta si tardamos)
  //    y procesamos en segundo plano.
  app.post("/webhook", (req, res) => {
    res.sendStatus(200);
    try {
      const entradas = req.body?.entry || [];
      for (const entry of entradas) {
        for (const ch of entry.changes || []) {
          const value = ch.value || {};
          // messages = mensajes de clientes → los atiende Max.
          for (const msg of value.messages || []) {
            procesarEntrante(msg, value).catch((e) => console.log("⚠ error procesando entrante:", e.message));
          }
          // message_echoes (smb_message_echoes) = el equipo respondió desde la app → handoff.
          for (const eco of value.message_echoes || []) {
            procesarEcoEquipo(eco).catch((e) => console.log("⚠ error procesando eco:", e.message));
          }
          // statuses = recibos de entrega/lectura. Los FALLADOS sí importan: es la
          // ÚNICA señal de que un envío aceptado por la API no se entregó (ej: un
          // aviso al equipo fuera de la ventana de 24 h → code 131047). Sin esto,
          // los avisos se perdían sin dejar rastro en ningún log.
          for (const st of value.statuses || []) {
            if (st.status === "delivered" || st.status === "read") {
              // Si era un aviso al equipo, el canal está vivo: se limpia la alarma.
              avisoEntregado(st.id);
              continue;
            }
            if (st.status !== "failed") continue;
            const err = (st.errors || [])[0] || {};
            const detalle = `code ${err.code || "?"} · ${err.title || err.message || ""}`;
            diag("envio_fallido", { jid: st.recipient_id, detalle });
            console.log(`⚠ envío a ${st.recipient_id} FALLÓ: ${detalle}`);
            // Si el que rebotó era un AVISO AL EQUIPO, esto no es un mensaje
            // perdido más: es el equipo quedándose sin derivaciones ni avisos de
            // transferencia. Se grita y se reintenta por el número de respaldo.
            const rebote = avisoRebotado(st.id, err.code, err.title || err.message || "");
            if (rebote.esAviso) {
              rescatarAviso(rebote, st.recipient_id, detalle).catch((e) => console.log("⚠ rescate del aviso falló:", e.message));
            }
          }
        }
      }
    } catch (e) {
      console.log("⚠ webhook: body inesperado:", e.message);
    }
  });

  console.log("🟢 WhatsApp Cloud API (Meta) montado en /webhook — Max atiende por la API oficial.");
}
