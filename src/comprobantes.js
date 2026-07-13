// Comprobantes (y cualquier imagen/PDF) que mandan los clientes: se guardan en Neon
// (tabla `media_max`) para poder verlos después en el visor de conversaciones del
// panel. El base64 NO va al historial de la conversación (es pesado y el modelo no
// lo necesita): en el historial queda solo un marcador [comprobante #id].
import "./env.js";
import { neon } from "@neondatabase/serverless";

const usaDB = !!process.env.DATABASE_URL;
const TOPE_BASE64 = 7_000_000; // ~5 MB binarios

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista || !usaDB) return;
  await sql`create table if not exists media_max (
    id bigserial primary key,
    chat_id text,
    mime text,
    tipo text,
    datos text,
    ts timestamptz default now()
  )`;
  tablaLista = true;
}

/** Parsea un data-URI de imagen o PDF. Devuelve {mime, tipo, base64} o null si no es
 *  un comprobante válido (no es imagen/pdf, no viene en base64, o supera el tope). */
export function parseComprobante(dataUri) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(dataUri || ""));
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const esBase64 = !!m[2];
  const base64 = m[3] || "";
  const esPdf = mime === "application/pdf";
  const esImg = mime.startsWith("image/");
  if (!esBase64 || (!esImg && !esPdf)) return null;
  if (base64.length > TOPE_BASE64) return null;
  return { mime, tipo: esPdf ? "pdf" : "imagen", base64 };
}

/** Guarda un comprobante desde su data-URI. Devuelve el id o null (sin DB / inválido). */
export async function guardarComprobanteDataUri(chatId, dataUri) {
  if (!usaDB) return null;
  const p = parseComprobante(dataUri);
  if (!p) return null;
  try {
    await asegurarTabla();
    const r = await sql`insert into media_max (chat_id, mime, tipo, datos)
      values (${chatId || ""}, ${p.mime}, ${p.tipo}, ${p.base64}) returning id`;
    return r.length ? Number(r[0].id) : null;
  } catch (e) {
    console.log("⚠ no pude guardar el comprobante:", e.message);
    return null;
  }
}

/** Trae un comprobante por id. Devuelve {mime, tipo, datos(base64)} o null. */
export async function obtenerMedia(id) {
  if (!usaDB) return null;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) return null;
  try {
    await asegurarTabla();
    const r = await sql`select mime, tipo, datos from media_max where id = ${idNum}`;
    if (!r.length) return null;
    return { mime: r[0].mime || "application/octet-stream", tipo: r[0].tipo || "imagen", datos: r[0].datos || "" };
  } catch (e) {
    console.log("⚠ no pude leer el comprobante:", e.message);
    return null;
  }
}
