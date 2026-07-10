// Conversaciones de las que se hizo cargo un ASESOR del equipo: Max se PAUSA ahí
// mientras el asesor está atendiendo. Apenas alguien del equipo ESCRIBE (desde el
// teléfono del bot) en una conversación, queda marcada como "del equipo" y Max no
// responde. La pausa NO es permanente: vence a las 3 HORAS del ÚLTIMO mensaje del
// asesor. Si el cliente vuelve a escribir pasadas esas 3 h sin actividad del
// asesor, Max despierta y retoma la conversación CON todo el historial (incluido
// lo que habló el asesor, que se guarda en memoria). Cada mensaje del asesor
// reinicia el reloj de 3 h. Max nunca escribe por su cuenta: solo responde si el
// cliente escribe.
//
// Se persiste en Neon para sobrevivir a los deploys/reinicios de Render.
import "./env.js";
import { neon } from "@neondatabase/serverless";

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

const VENTANA_MS = 3 * 60 * 60 * 1000; // 3 horas sin actividad del asesor → Max despierta
const humanas = new Map();             // jid -> timestamp (ms) del último mensaje del asesor
let cargado = false;

async function prepararTablas() {
  await sql`create table if not exists conversaciones_humano (
    jid text primary key,
    avisado boolean default false,
    agregado timestamptz default now()
  )`;
  // Columna para el vencimiento de la pausa (se actualiza con cada mensaje del asesor).
  await sql`alter table conversaciones_humano add column if not exists ultima_actividad timestamptz default now()`;
}

/** Carga a memoria las conversaciones en pausa por un asesor. Llamar al iniciar. */
export async function cargarEstado() {
  if (cargado) return;
  if (!process.env.DATABASE_URL) { cargado = true; return; } // simulador: no aplica
  await prepararTablas();
  for (const f of await sql`select jid, extract(epoch from coalesce(ultima_actividad, agregado)) * 1000 as ms from conversaciones_humano`) {
    humanas.set(f.jid, Number(f.ms) || Date.now());
  }
  cargado = true;
  console.log(`📋 conversaciones en pausa por un asesor (Max afuera): ${humanas.size}`);
}

/** ¿La conversación está en pausa por un asesor ACTIVO (últimas 3 h)? Si la pausa
 *  venció (3 h sin que el asesor escriba), la libera y devuelve false: Max retoma. */
export function esHumano(jid) {
  if (!humanas.has(jid)) return false;
  const ultimo = humanas.get(jid);
  if (Date.now() - ultimo >= VENTANA_MS) {
    liberar(jid); // venció la pausa → Max vuelve a atender este chat
    return false;
  }
  return true;
}

/** Marca/renueva que un asesor está atendiendo esta conversación: reinicia el
 *  reloj de 3 h. Max no responde mientras la pausa siga vigente. */
export async function marcarHumano(jid) {
  if (!jid) return;
  humanas.set(jid, Date.now());
  if (!process.env.DATABASE_URL) return;
  try {
    await sql`insert into conversaciones_humano (jid, ultima_actividad) values (${jid}, now())
              on conflict (jid) do update set ultima_actividad = now()`;
  } catch (e) { console.log("⚠ no pude guardar conversación del equipo:", e.message); }
}

/** Libera una conversación: a partir de ahí Max la vuelve a atender. */
export async function liberar(jid) {
  humanas.delete(jid);
  if (!process.env.DATABASE_URL) return;
  try { await sql`delete from conversaciones_humano where jid = ${jid}`; } catch {}
}

/** Libera TODAS las conversaciones pausadas (útil tras un misfire de handoffs).
 *  Devuelve cuántas había. */
export async function liberarTodo() {
  const n = humanas.size;
  humanas.clear();
  if (process.env.DATABASE_URL) {
    try { await sql`delete from conversaciones_humano`; } catch {}
  }
  return n;
}
