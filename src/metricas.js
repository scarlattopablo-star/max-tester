// Métricas de actividad de Max: cuántos mensajes respondió y a cuántas
// conversaciones atendió, por día de Montevideo (hoy / 7 días / 30 días).
//
// Dos fuentes, porque empezamos a contar recién con este deploy:
//  1) CONTADOR EXACTO (tabla `mensajes_max`): una fila por cada mensaje que Max
//     envía, con su timestamp. Es preciso, pero solo desde que se deployó esto.
//  2) APROXIMADO HISTÓRICO (tabla `conversaciones`, ya existente): para el día
//     en curso da una foto retroactiva contando los mensajes "assistant" que ya
//     quedaron guardados en las charlas activas hoy. Sobrecuenta un poco (incluye
//     mensajes previos que siguen en la ventana de 40), por eso va rotulado "aprox".
//
// Sin DATABASE_URL (simulador) devuelve todo en cero y no rompe.
import "./env.js";
import { neon } from "@neondatabase/serverless";

const usaDB = !!process.env.DATABASE_URL;

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista || !usaDB) return;
  await sql`create table if not exists mensajes_max (
    id bigserial primary key,
    chat_id text,
    ts timestamptz default now()
  )`;
  tablaLista = true;
}

/** Registra que Max envió un mensaje (fire-and-forget, no bloquea el envío). */
export function registrarMensajeMax(chatId) {
  if (!usaDB) return;
  asegurarTabla()
    .then(() => sql`insert into mensajes_max (chat_id) values (${chatId})`)
    .catch((e) => console.log("⚠ no pude registrar métrica de mensaje:", e.message));
}

const cero = () => ({ mensajes: 0, conversaciones: 0 });

/** Resumen completo para el panel: contador exacto + aproximado de hoy. */
export async function resumenMensajes() {
  const vacio = {
    disponible: false,
    contador: { hoy: cero(), d7: cero(), d30: cero() },
    aproxHoy: { conversaciones: 0, mensajes: 0 },
  };
  if (!usaDB) return vacio;
  try {
    await asegurarTabla();

    // Contador exacto (desde el deploy). "Hoy" = día calendario de Montevideo.
    const [c] = await sql`
      select
        count(*) filter (
          where (ts at time zone 'America/Montevideo')
                >= date_trunc('day', now() at time zone 'America/Montevideo')) as msj_hoy,
        count(distinct chat_id) filter (
          where (ts at time zone 'America/Montevideo')
                >= date_trunc('day', now() at time zone 'America/Montevideo')) as conv_hoy,
        count(*) filter (where ts >= now() - interval '7 days') as msj_7,
        count(distinct chat_id) filter (where ts >= now() - interval '7 days') as conv_7,
        count(*) as msj_30,
        count(distinct chat_id) as conv_30
      from mensajes_max
      where ts >= now() - interval '30 days'`;

    // Foto retroactiva de HOY desde las conversaciones ya guardadas.
    const [a] = await sql`
      select
        count(*) as conversaciones,
        coalesce(sum((
          select count(*) from jsonb_array_elements(c.mensajes) m
          where m->>'role' = 'assistant'
        )), 0) as mensajes
      from conversaciones c
      where (c.actualizado at time zone 'America/Montevideo')
            >= date_trunc('day', now() at time zone 'America/Montevideo')`;

    return {
      disponible: true,
      contador: {
        hoy: { mensajes: Number(c?.msj_hoy) || 0, conversaciones: Number(c?.conv_hoy) || 0 },
        d7: { mensajes: Number(c?.msj_7) || 0, conversaciones: Number(c?.conv_7) || 0 },
        d30: { mensajes: Number(c?.msj_30) || 0, conversaciones: Number(c?.conv_30) || 0 },
      },
      aproxHoy: {
        conversaciones: Number(a?.conversaciones) || 0,
        mensajes: Number(a?.mensajes) || 0,
      },
    };
  } catch (e) {
    console.log("⚠ no pude leer métricas de mensajes:", e.message);
    return vacio;
  }
}
