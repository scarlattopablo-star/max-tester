// Conversaciones que YA existían en el WhatsApp antes de que Max empezara a
// atender. Esas las sigue un HUMANO: Max no se mete (solo avisa una vez al
// equipo). Trazamos una "línea": al primer arranque tomamos una foto de todos
// los chats que hay en el teléfono y los marcamos como previos; de ahí en
// adelante, las conversaciones NUEVAS las atiende Max normalmente.
//
// Se persiste en Neon para sobrevivir a los deploys/reinicios de Render.
import "./env.js";
import { neon } from "@neondatabase/serverless";

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

const previas = new Set();   // jids de conversaciones previas (humano las atiende)
const avisados = new Set();  // jids previos que YA se avisaron al equipo
let snapshotListo = false;   // ¿ya tomamos la foto inicial de chats?
let cargado = false;

async function prepararTablas() {
  await sql`create table if not exists conversaciones_previas (
    jid text primary key,
    avisado boolean default false,
    agregado timestamptz default now()
  )`;
  await sql`create table if not exists wa_flags (clave text primary key, valor text)`;
}

/** Carga el set de previas + el flag de snapshot a memoria. Llamar al iniciar. */
export async function cargarPrevias() {
  if (cargado) return;
  if (!process.env.DATABASE_URL) { cargado = true; return; } // sin base (simulador): no aplica
  await prepararTablas();
  const filas = await sql`select jid, avisado from conversaciones_previas`;
  for (const f of filas) {
    previas.add(f.jid);
    if (f.avisado) avisados.add(f.jid);
  }
  const flag = await sql`select valor from wa_flags where clave = 'snapshot_previas'`;
  snapshotListo = flag.length > 0;
  cargado = true;
  console.log(`📋 previas cargadas: ${previas.size} conversaciones${snapshotListo ? " (foto ya tomada)" : " (falta tomar la foto inicial)"}`);
}

export function snapshotTomado() { return snapshotListo; }
export function esPrevia(jid) { return previas.has(jid); }
export function yaAvisado(jid) { return avisados.has(jid); }

/** Agrega jids al set de previas (idempotente). Lo usa la foto inicial de chats. */
export async function agregarPrevias(jids) {
  const nuevos = [...new Set(jids)].filter((j) => j && !previas.has(j));
  if (!nuevos.length) return 0;
  for (const jid of nuevos) {
    previas.add(jid);
    try {
      await sql`insert into conversaciones_previas (jid) values (${jid})
                on conflict (jid) do nothing`;
    } catch (e) { console.log("⚠ no pude guardar previa:", e.message); }
  }
  return nuevos.length;
}

/** Marca que ya tomamos la foto inicial: no volver a tomarla en próximos arranques. */
export async function marcarSnapshotTomado() {
  if (snapshotListo) return;
  snapshotListo = true;
  try {
    await sql`insert into wa_flags (clave, valor) values ('snapshot_previas', ${String(Date.now())})
              on conflict (clave) do nothing`;
  } catch (e) { console.log("⚠ no pude marcar el snapshot:", e.message); }
}

/** Marca que al equipo ya se le avisó de esta conversación previa (una sola vez). */
export async function marcarAvisado(jid) {
  if (avisados.has(jid)) return;
  avisados.add(jid);
  try {
    await sql`update conversaciones_previas set avisado = true where jid = ${jid}`;
  } catch (e) { console.log("⚠ no pude marcar avisado:", e.message); }
}

/** Libera una conversación previa: a partir de ahí Max la vuelve a atender. */
export async function liberarPrevia(jid) {
  previas.delete(jid);
  avisados.delete(jid);
  try { await sql`delete from conversaciones_previas where jid = ${jid}`; } catch {}
}
