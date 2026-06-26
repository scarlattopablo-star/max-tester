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

/** Resumen completo para el panel: contador exacto + aproximado de hoy.
 *  Para que el trabajo de Max SIEMPRE se note (el contador exacto `mensajes_max`
 *  recién arranca con su deploy), combinamos dos fuentes y nos quedamos con la
 *  MAYOR de cada una: el contador exacto y el HISTÓRICO derivado de la tabla
 *  `conversaciones` (que ya guarda todas las charlas y sobrevive a los deploys).
 *  Así el número nunca subreporta lo que Max hizo. */
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

    // HISTÓRICO desde las conversaciones guardadas (hoy / 7 / 30 días). Cada charla
    // aporta sus mensajes "assistant" (lo que respondió Max). Es aproximado por arriba
    // del recorte de 40 mensajes por chat, pero refleja todo el historial, no solo lo
    // contado desde el último deploy.
    const [h] = await sql`
      select
        count(*) filter (
          where (actualizado at time zone 'America/Montevideo')
                >= date_trunc('day', now() at time zone 'America/Montevideo')) as conv_hoy,
        count(*) filter (where actualizado >= now() - interval '7 days') as conv_7,
        count(*) as conv_30,
        coalesce(sum(asis) filter (
          where (actualizado at time zone 'America/Montevideo')
                >= date_trunc('day', now() at time zone 'America/Montevideo')), 0) as msj_hoy,
        coalesce(sum(asis) filter (where actualizado >= now() - interval '7 days'), 0) as msj_7,
        coalesce(sum(asis), 0) as msj_30
      from (
        select actualizado, (
          select count(*) from jsonb_array_elements(c.mensajes) m
          where m->>'role' = 'assistant'
        ) as asis
        from conversaciones c
        where c.actualizado >= now() - interval '30 days'
      ) t`;

    // Nos quedamos con la cifra MÁS ALTA entre el contador exacto y el histórico.
    const mejor = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
    const ventana = (cMsj, cConv, hMsj, hConv) => ({
      mensajes: mejor(cMsj, hMsj),
      conversaciones: mejor(cConv, hConv),
    });

    return {
      disponible: true,
      contador: {
        hoy: ventana(c?.msj_hoy, c?.conv_hoy, h?.msj_hoy, h?.conv_hoy),
        d7: ventana(c?.msj_7, c?.conv_7, h?.msj_7, h?.conv_7),
        d30: ventana(c?.msj_30, c?.conv_30, h?.msj_30, h?.conv_30),
      },
      aproxHoy: {
        conversaciones: Number(h?.conv_hoy) || 0,
        mensajes: Number(h?.msj_hoy) || 0,
      },
    };
  } catch (e) {
    console.log("⚠ no pude leer métricas de mensajes:", e.message);
    return vacio;
  }
}
