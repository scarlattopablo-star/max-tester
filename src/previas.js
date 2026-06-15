// Conversaciones de las que se hizo cargo un ASESOR del equipo: Max no vuelve a
// participar ahí. Apenas alguien del equipo ESCRIBE (desde el teléfono del bot)
// en una conversación, esa conversación queda marcada como "del equipo" de forma
// PERMANENTE y Max no responde más en ella. Se libera con liberar(jid) si se
// quiere devolver a Max.
//
// Se persiste en Neon para sobrevivir a los deploys/reinicios de Render.
import "./env.js";
import { neon } from "@neondatabase/serverless";

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

const humanas = new Set();         // jids de conversaciones tomadas por el equipo (Max afuera)
let cargado = false;

async function prepararTablas() {
  await sql`create table if not exists conversaciones_humano (
    jid text primary key,
    avisado boolean default false,
    agregado timestamptz default now()
  )`;
}

/** Carga a memoria las conversaciones tomadas por el equipo. Llamar al iniciar. */
export async function cargarEstado() {
  if (cargado) return;
  if (!process.env.DATABASE_URL) { cargado = true; return; } // simulador: no aplica
  await prepararTablas();
  for (const f of await sql`select jid from conversaciones_humano`) humanas.add(f.jid);
  cargado = true;
  console.log(`📋 conversaciones tomadas por el equipo (Max afuera): ${humanas.size}`);
}

/** ¿Un asesor se hizo cargo de esta conversación? (Max no participa) */
export function esHumano(jid) { return humanas.has(jid); }

/** Marca que un asesor tomó esta conversación: Max no vuelve a participar. */
export async function marcarHumano(jid) {
  if (!jid || humanas.has(jid)) return;
  humanas.add(jid);
  if (!process.env.DATABASE_URL) return;
  try {
    await sql`insert into conversaciones_humano (jid) values (${jid}) on conflict (jid) do nothing`;
  } catch (e) { console.log("⚠ no pude guardar conversación del equipo:", e.message); }
}

/** Libera una conversación: a partir de ahí Max la vuelve a atender. */
export async function liberar(jid) {
  humanas.delete(jid);
  if (!process.env.DATABASE_URL) return;
  try { await sql`delete from conversaciones_humano where jid = ${jid}`; } catch {}
}
