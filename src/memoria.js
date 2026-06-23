// Memoria de conversación por chat (para que Max recuerde el hilo).
// PERSISTE EN NEON (tabla `conversaciones`) para sobrevivir a los deploys/reinicios
// de Render: así Max no pierde el contexto ni se vuelve a presentar tras un deploy,
// y las charlas quedan disponibles para el análisis de aprendizaje (aprendizaje.js).
// Patrón: caché en memoria (lecturas SINCRÓNICAS, no rompen a quien la usa) +
// escritura "write-through" a la base en segundo plano. Sin DATABASE_URL (simulador)
// cae al archivo en disco de siempre.
import "./env.js";
import { leer, guardar } from "./store.js";
import { neon } from "@neondatabase/serverless";

const ARCHIVO = "conversaciones.json";
const MAX_MENSAJES = 40; // cuántos mensajes recuerda por chat
const usaDB = !!process.env.DATABASE_URL;

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

const cache = new Map(); // chatId -> [{role, content}]
let cargado = false;

/** Carga todas las conversaciones a memoria. Llamar UNA vez al iniciar (idempotente). */
export async function cargarConversaciones() {
  if (cargado) return;
  if (!usaDB) {
    const todas = leer(ARCHIVO, {});
    for (const [k, v] of Object.entries(todas)) cache.set(k, v);
    cargado = true;
    return;
  }
  try {
    await sql`create table if not exists conversaciones (
      chat_id text primary key,
      mensajes jsonb not null default '[]',
      actualizado timestamptz default now()
    )`;
    for (const f of await sql`select chat_id, mensajes from conversaciones`) {
      cache.set(f.chat_id, Array.isArray(f.mensajes) ? f.mensajes : []);
    }
    console.log(`💬 conversaciones cargadas de la base: ${cache.size}`);
  } catch (e) {
    console.log("⚠ no pude cargar conversaciones de la base:", e.message);
  }
  cargado = true;
}

export function historial(chatId) {
  return cache.get(chatId) || [];
}

export function agregar(chatId, rol, contenido) {
  const arr = (cache.get(chatId) || []).slice();
  arr.push({ role: rol, content: contenido });
  const recortada = arr.length > MAX_MENSAJES ? arr.slice(-MAX_MENSAJES) : arr;
  cache.set(chatId, recortada);
  persistir(chatId, recortada);
}

export function reiniciar(chatId) {
  cache.delete(chatId);
  if (usaDB) {
    sql`delete from conversaciones where chat_id = ${chatId}`.catch(() => {});
  } else {
    guardar(ARCHIVO, Object.fromEntries(cache));
  }
}

// Escribe la conversación en la base (o disco) sin bloquear al que llamó a agregar().
function persistir(chatId, mensajes) {
  if (usaDB) {
    sql`insert into conversaciones (chat_id, mensajes, actualizado)
        values (${chatId}, ${JSON.stringify(mensajes)}::jsonb, now())
        on conflict (chat_id) do update set mensajes = ${JSON.stringify(mensajes)}::jsonb, actualizado = now()`
      .catch((e) => console.log("⚠ no pude guardar la conversación:", e.message));
  } else {
    guardar(ARCHIVO, Object.fromEntries(cache));
  }
}

/** Las últimas N conversaciones (más recientes primero), para revisar cómo conversó Max.
 *  Devuelve [{chatId, mensajes, actualizado}]. Con DATABASE_URL ordena por fecha;
 *  sin base (simulador) devuelve lo que haya en memoria. */
export async function ultimasConversaciones(n = 20) {
  if (!usaDB) {
    return [...cache.entries()].slice(-n).reverse().map(([chatId, mensajes]) => ({ chatId, mensajes, actualizado: null }));
  }
  try {
    const rows = await sql`select chat_id, mensajes, actualizado from conversaciones
      order by actualizado desc limit ${n}`;
    return rows.map((r) => ({ chatId: r.chat_id, mensajes: Array.isArray(r.mensajes) ? r.mensajes : [], actualizado: r.actualizado }));
  } catch (e) {
    console.log("⚠ no pude leer las últimas conversaciones:", e.message);
    return [];
  }
}

/** Conversaciones cuya última actividad cae en un rango (para el análisis nocturno).
 *  Devuelve [{chatId, mensajes, actualizado}]. Solo con DATABASE_URL. */
export async function conversacionesEntre(desdeISO, hastaISO) {
  if (!usaDB) return [];
  try {
    const rows = await sql`select chat_id, mensajes, actualizado from conversaciones
      where actualizado >= ${desdeISO} and actualizado < ${hastaISO}
      order by actualizado desc`;
    return rows.map((r) => ({ chatId: r.chat_id, mensajes: Array.isArray(r.mensajes) ? r.mensajes : [], actualizado: r.actualizado }));
  } catch (e) {
    console.log("⚠ no pude leer conversaciones para el análisis:", e.message);
    return [];
  }
}

/** Reclama una tarea ÚNICA (idempotencia entre reinicios de Render). Devuelve true
 *  si la reclamó por PRIMERA vez (hay que ejecutarla), false si ya estaba hecha o no
 *  hay base para deduplicar. Se usa para que el reenvío automático de ventas corra
 *  una sola vez y no se repita en cada arranque. */
export async function reclamarTareaUnica(clave) {
  if (!usaDB) return false;
  try {
    await sql`create table if not exists tareas_unicas (
      clave text primary key,
      created_at timestamptz default now()
    )`;
    const rows = await sql`insert into tareas_unicas (clave) values (${clave})
      on conflict (clave) do nothing returning clave`;
    return rows.length > 0;
  } catch (e) {
    console.log("⚠ no pude reclamar la tarea única:", e.message);
    return false;
  }
}
