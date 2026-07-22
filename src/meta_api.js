// Cliente de bajo nivel para la WhatsApp Cloud API (Meta oficial).
// Reemplaza el transporte de Baileys: en vez de un socket, hablamos por HTTP con
// el Graph API de Meta. Lo usa whatsapp_meta.js (entrante/saliente) y el broadcast
// de promos (clientes.js).
//
// Dos transportes posibles (mismo formato de payloads, cambia el host y la auth):
//   A) Meta directo:  WHATSAPP_TOKEN (System User permanente) + WHATSAPP_PHONE_ID
//   B) 360dialog:     D360_API_KEY (Coexistence; el número vive en 360dialog y
//      NO hace falta phone_id: la key ya identifica al número). Si D360_API_KEY
//      está presente, gana sobre el transporte directo.
//   WHATSAPP_API_VERSION    (opcional) versión del Graph API, por defecto v21.0
import "./env.js";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
const D360_BASE = "https://waba-v2.360dialog.io";

function d360Key() {
  return process.env.D360_API_KEY || "";
}
function token() {
  const t = process.env.WHATSAPP_TOKEN;
  if (!t) throw new Error("FALTA_WHATSAPP_TOKEN");
  return t;
}
function phoneId() {
  const id = process.env.WHATSAPP_PHONE_ID;
  if (!id) throw new Error("FALTA_WHATSAPP_PHONE_ID");
  return id;
}

// ¿Está configurada la Cloud API? (para que start.js/web.js sepan si pueden arrancarla)
export function metaConfigurado() {
  return !!(d360Key() || (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID));
}

// POST genérico a .../messages. Devuelve el JSON de Meta (incluye el id del
// mensaje saliente en messages[0].id). Lanza con el detalle del error de Meta.
// Con 360dialog el endpoint es /messages a secas (sin phone_id) y la auth es
// el header D360-API-KEY; los payloads y las respuestas son idénticos a Meta.
async function postMensaje(payload) {
  const url = d360Key() ? `${D360_BASE}/messages` : `${GRAPH}/${phoneId()}/messages`;
  const headers = d360Key()
    ? { "D360-API-KEY": d360Key(), "Content-Type": "application/json" }
    : { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = data?.error || {};
    // code 131047 = fuera de la ventana de 24 h (hay que usar plantilla).
    const err = new Error(`meta_${r.status}: ${e.message || "error"}${e.code ? ` (code ${e.code})` : ""}`);
    err.status = r.status;
    err.metaCode = e.code;
    throw err;
  }
  return data;
}

// "59891629784@s.whatsapp.net" | "091629784" | "59891..." -> "59891629784"
// La Cloud API quiere el número internacional SIN '+' ni sufijos.
export function aWaId(numero) {
  let d = String(numero || "").split("@")[0].replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("598")) d = "598" + d;
  return d;
}

// Texto libre. Solo permitido DENTRO de la ventana de 24 h desde el último mensaje
// del cliente; fuera de ella Meta lo rechaza (code 131047) y hay que usar plantilla.
export async function enviarTextoMeta(to, texto) {
  return postMensaje({
    to: aWaId(to),
    type: "text",
    text: { preview_url: true, body: String(texto || "").slice(0, 4096) },
  });
}

// Imagen por URL pública (Max manda fotos del catálogo, que ya son URLs http).
export async function enviarImagenMeta(to, url, caption = "") {
  return postMensaje({
    to: aWaId(to),
    type: "image",
    image: { link: url, caption: String(caption || "").slice(0, 1024) },
  });
}

// Plantilla aprobada (para escribir FUERA de las 24 h: promos, reenganche).
// componentes: array al formato Graph (ej: [{ type:"body", parameters:[{type:"text", text:"15%"}] }]).
export async function enviarPlantillaMeta(to, nombre, idioma = "es", componentes = []) {
  return postMensaje({
    to: aWaId(to),
    type: "template",
    template: { name: nombre, language: { code: idioma }, ...(componentes.length ? { components: componentes } : {}) },
  });
}

// Marca el mensaje como leído y muestra "escribiendo…" (hasta ~25 s o hasta que
// mandemos la respuesta). Hace que Max se sienta humano, igual que con Baileys.
// Tolerante a fallos: si Meta no lo soporta, no rompe el flujo.
export async function marcarLeidoEscribiendo(messageId) {
  if (!messageId) return;
  try {
    await postMensaje({ status: "read", message_id: messageId, typing_indicator: { type: "text" } });
  } catch (e) {
    // Algunos números/versiones no habilitan el typing_indicator: intentamos solo "read".
    try { await postMensaje({ status: "read", message_id: messageId }); } catch {}
  }
}

// Descarga un media entrante (imagen que mandó el cliente) y lo devuelve como
// data-URI base64, igual formato que usaba Baileys (lo consume el cerebro/visión).
// Con 360dialog: la info del media se pide a su proxy, y la URL temporal que
// devuelve (lookaside.fbsbx.com) hay que bajarla REEMPLAZANDO el dominio por el
// proxy de 360dialog (regla de su doc; el binario no sale directo de Meta).
export async function mediaComoDataUri(mediaId) {
  try {
    const key = d360Key();
    const infoUrl = key ? `${D360_BASE}/${mediaId}` : `${GRAPH}/${mediaId}`;
    const headers = key ? { "D360-API-KEY": key } : { Authorization: `Bearer ${token()}` };
    // 1) pedir la URL temporal del media
    const meta = await fetch(infoUrl, { headers });
    const info = await meta.json();
    if (!info?.url) return null;
    // 2) bajar el binario (misma auth; con 360dialog, vía su proxy)
    const binUrl = key ? String(info.url).replace(/^https:\/\/[^/]+/, D360_BASE) : info.url;
    const bin = await fetch(binUrl, { headers });
    const buf = Buffer.from(await bin.arrayBuffer());
    const mime = info.mime_type || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.log("⚠ no pude descargar el media de Meta:", e.message);
    return null;
  }
}
