// Conversaciones que está atendiendo un HUMANO del equipo: Max no entra ahí.
//
// Regla (apartarse de las charlas viejas / pre-Max, NO de las nuevas):
//  - Si un humano CONTESTA en una conversación donde Max NUNCA habló, es una
//    charla vieja (existía antes de que Max atendiera) → la maneja el equipo y
//    Max se silencia ahí... pero NO para siempre: si la conversación queda
//    QUIETA 1 hora, Max vuelve a quedar atento (por si el cliente vuelve otro
//    día). La ventana se renueva con cada mensaje (humano o cliente).
//  - Si Max venía atendiendo (ya respondió ahí) y un asesor entra, eso es el
//    handoff TEMPORAL de 10 min (lo maneja whatsapp.js con humanoHasta): NO
//    pasa por acá; Max retoma después.
//
// `conversaciones_max` recuerda dónde respondió Max (persiste deploys, así una
// charla nueva no se confunde con una vieja tras un reinicio de Render).
// `conversaciones_humano.hasta` = epoch ms hasta el que Max sigue callado.
// Se persiste en Neon para sobrevivir a los deploys/reinicios.
import "./env.js";
import { neon } from "@neondatabase/serverless";

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

const silencioHasta = new Map();   // jid -> epoch ms hasta el que Max no entra (charla vieja)
const humanasAvisadas = new Set();  // jids ya avisados al equipo (una vez por ventana)
const deMax = new Set();            // jids donde Max ya respondió alguna vez
let cargado = false;

async function prepararTablas() {
  await sql`create table if not exists conversaciones_humano (
    jid text primary key,
    hasta bigint not null default 0,
    avisado boolean default false,
    agregado timestamptz default now()
  )`;
  // Migración suave: si la tabla existía sin la columna, la agregamos.
  await sql`alter table conversaciones_humano add column if not exists hasta bigint not null default 0`;
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
  for (const f of await sql`select jid, hasta, avisado from conversaciones_humano`) {
    silencioHasta.set(f.jid, Number(f.hasta));
    if (f.avisado) humanasAvisadas.add(f.jid);
  }
  for (const f of await sql`select jid from conversaciones_max`) deMax.add(f.jid);
  cargado = true;
  const activas = [...silencioHasta.values()].filter((t) => t > Date.now()).length;
  console.log(`📋 estado conversaciones: ${activas} en manos de un humano ahora · ${deMax.size} atendidas por Max`);
}

/** ¿Esta conversación está silenciada (la maneja un humano y NO pasó la hora)? */
export function silenciadoPorHumano(jid) {
  const hasta = silencioHasta.get(jid);
  return !!hasta && Date.now() < hasta;
}

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

/** Silencia a Max en esta conversación por `ms` desde ahora (charla vieja del
 *  equipo). Se renueva con cada mensaje. `persistir`=false solo refresca memoria
 *  (para no escribir en la base en cada mensaje del cliente). */
export async function silenciar(jid, ms, persistir = true) {
  const hasta = Date.now() + ms;
  silencioHasta.set(jid, hasta);
  if (!persistir || !process.env.DATABASE_URL) return;
  try {
    await sql`insert into conversaciones_humano (jid, hasta) values (${jid}, ${hasta})
              on conflict (jid) do update set hasta = ${hasta}`;
  } catch (e) { console.log("⚠ no pude guardar conversación humana:", e.message); }
}

/** Marca que ya se le avisó al equipo de esta conversación (una vez por ventana). */
export async function marcarHumanoAvisado(jid) {
  if (humanasAvisadas.has(jid)) return;
  humanasAvisadas.add(jid);
  if (!process.env.DATABASE_URL) return;
  try {
    await sql`update conversaciones_humano set avisado = true where jid = ${jid}`;
  } catch (e) { console.log("⚠ no pude marcar humano avisado:", e.message); }
}

/** Libera una conversación: a partir de ahí Max la vuelve a atender ya mismo. */
export async function liberar(jid) {
  silencioHasta.delete(jid);
  humanasAvisadas.delete(jid);
  if (!process.env.DATABASE_URL) return;
  try { await sql`delete from conversaciones_humano where jid = ${jid}`; } catch {}
}
