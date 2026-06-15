// Conversaciones que maneja un HUMANO del equipo: Max no entra ahí.
//
// Regla: apenas alguien del equipo CONTESTA en una conversación desde el
// teléfono del bot, esa conversación pasa a ser del equipo (persistente) y Max
// no responde más. Cubre las charlas viejas / que el equipo ya viene atendiendo.
// Se libera con liberar(jid) si se quiere devolver a Max.
//
// Se persiste en Neon para sobrevivir a los deploys/reinicios de Render.
import "./env.js";
import { neon } from "@neondatabase/serverless";

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

const humanas = new Set();        // jids de conversaciones que son de un humano (Max no entra)
const humanasAvisadas = new Set(); // jids ya avisados al equipo (una vez)
let cargado = false;

async function prepararTablas() {
  await sql`create table if not exists conversaciones_humano (
    jid text primary key,
    avisado boolean default false,
    agregado timestamptz default now()
  )`;
}

/** Carga a memoria las conversaciones de humanos. Llamar al iniciar. */
export async function cargarEstado() {
  if (cargado) return;
  if (!process.env.DATABASE_URL) { cargado = true; return; } // simulador: no aplica
  await prepararTablas();
  for (const f of await sql`select jid, avisado from conversaciones_humano`) {
    humanas.add(f.jid);
    if (f.avisado) humanasAvisadas.add(f.jid);
  }
  cargado = true;
  console.log(`📋 estado conversaciones: ${humanas.size} las maneja un humano (Max no entra)`);
}

export function esHumano(jid) { return humanas.has(jid); }
export function humanoYaAvisado(jid) { return humanasAvisadas.has(jid); }

/** Marca que esta conversación pasa a ser de un HUMANO: Max no entra más. */
export async function marcarHumano(jid) {
  if (!jid || humanas.has(jid)) return;
  humanas.add(jid);
  if (!process.env.DATABASE_URL) return;
  try {
    await sql`insert into conversaciones_humano (jid) values (${jid}) on conflict (jid) do nothing`;
  } catch (e) { console.log("⚠ no pude guardar conversación humana:", e.message); }
}

/** Marca que ya se le avisó al equipo de esta conversación humana (una sola vez). */
export async function marcarHumanoAvisado(jid) {
  if (humanasAvisadas.has(jid)) return;
  humanasAvisadas.add(jid);
  if (!process.env.DATABASE_URL) return;
  try {
    await sql`update conversaciones_humano set avisado = true where jid = ${jid}`;
  } catch (e) { console.log("⚠ no pude marcar humano avisado:", e.message); }
}

/** Libera una conversación humana: a partir de ahí Max la vuelve a atender. */
export async function liberar(jid) {
  humanas.delete(jid);
  humanasAvisadas.delete(jid);
  if (!process.env.DATABASE_URL) return;
  try { await sql`delete from conversaciones_humano where jid = ${jid}`; } catch {}
}
