// Conversaciones que maneja un HUMANO del equipo: Max no entra ahí.
//
// Regla (para apartarse SOLO de las charlas viejas / pre-Max, no de las nuevas):
//  - Si un humano CONTESTA en una conversación donde Max NUNCA habló, es una
//    charla vieja (existía antes de que Max atendiera) → pasa a ser del equipo
//    y Max no entra más (persistente).
//  - Si Max venía atendiendo (ya respondió ahí) y un asesor entra, eso es el
//    handoff TEMPORAL de 10 min (lo maneja whatsapp.js con humanoHasta): NO la
//    marca como humana, Max retoma después.
//
// `conversaciones_max` recuerda dónde respondió Max (persiste deploys, así una
// charla nueva no se confunde con una vieja tras un reinicio de Render).
// Se persiste en Neon para sobrevivir a los deploys/reinicios.
import "./env.js";
import { neon } from "@neondatabase/serverless";

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

const humanas = new Set();        // jids de conversaciones que son de un humano (Max no entra)
const humanasAvisadas = new Set(); // jids ya avisados al equipo (una vez)
const deMax = new Set();           // jids donde Max ya respondió alguna vez
let cargado = false;

async function prepararTablas() {
  await sql`create table if not exists conversaciones_humano (
    jid text primary key,
    avisado boolean default false,
    agregado timestamptz default now()
  )`;
  await sql`create table if not exists conversaciones_max (
    jid text primary key,
    agregado timestamptz default now()
  )`;
}

/** Carga a memoria el estado de las conversaciones. Llamar al iniciar. */
export async function cargarEstado() {
  if (cargado) return;
  if (!process.env.DATABASE_URL) { cargado = true; return; } // simulador: no aplica
  await prepararTablas();
  for (const f of await sql`select jid, avisado from conversaciones_humano`) {
    humanas.add(f.jid);
    if (f.avisado) humanasAvisadas.add(f.jid);
  }
  for (const f of await sql`select jid from conversaciones_max`) deMax.add(f.jid);
  cargado = true;
  console.log(`📋 estado conversaciones: ${humanas.size} de humanos (Max no entra) · ${deMax.size} atendidas por Max`);
}

export function esHumano(jid) { return humanas.has(jid); }
export function maxYaRespondio(jid) { return deMax.has(jid); }
export function humanoYaAvisado(jid) { return humanasAvisadas.has(jid); }

/** Marca que Max respondió en esta conversación (así sabemos que es NUEVA, no vieja). */
export async function marcarMaxRespondio(jid) {
  if (!jid || deMax.has(jid)) return;
  deMax.add(jid);
  if (!process.env.DATABASE_URL) return;
  try {
    await sql`insert into conversaciones_max (jid) values (${jid}) on conflict (jid) do nothing`;
  } catch (e) { console.log("⚠ no pude guardar conversación de Max:", e.message); }
}

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
