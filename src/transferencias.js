// Gestiones de pago por TRANSFERENCIA que maneja Max: cuando un cliente avisa
// que transfirió (o manda el comprobante), acá queda registrado. De esta tabla
// salen las métricas del panel /admin (gestiones vs. confirmadas con comprobante)
// y el dato que acompaña el aviso al equipo asesor.
//
// En Neon (tabla `transferencias_max`) para sobrevivir a los deploys de Render;
// sin DATABASE_URL (simulador) cae a un archivo local y no rompe.
import "./env.js";
import { neon } from "@neondatabase/serverless";
import { leer, guardar } from "./store.js";

const ARCHIVO = "transferencias.json";
const usaDB = !!process.env.DATABASE_URL;

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista || !usaDB) return;
  await sql`create table if not exists transferencias_max (
    id bigserial primary key,
    chat_id text,
    monto numeric,
    nombre text,
    telefono text,
    detalle text,
    comprobante boolean default false,
    ts timestamptz default now()
  )`;
  tablaLista = true;
}

/** Registra una gestión de transferencia (aviso del cliente o comprobante recibido).
 *  La llama la herramienta `confirmar_transferencia` del cerebro. Devuelve el
 *  registro para que whatsapp.js arme el aviso al equipo. */
export async function registrarTransferencia({ chatId, monto, nombre, telefono, detalle, comprobante } = {}) {
  const t = {
    chatId: chatId || "",
    monto: Number(monto) || 0,
    nombre: nombre || "",
    telefono: telefono || "",
    detalle: detalle || "",
    comprobante: !!comprobante,
    ts: new Date().toISOString(),
  };
  if (usaDB) {
    try {
      await asegurarTabla();
      // Si el cliente primero avisó ("ya transferí") y después mandó el comprobante,
      // NO es una gestión nueva: actualizamos la última de ese chat (últimas 48 h).
      const previas = await sql`select id, comprobante from transferencias_max
        where chat_id = ${t.chatId} and ts >= now() - interval '48 hours'
        order by ts desc limit 1`;
      if (previas.length) {
        const p = previas[0];
        await sql`update transferencias_max set
            comprobante = comprobante or ${t.comprobante},
            monto = case when ${t.monto} > 0 then ${t.monto} else monto end,
            nombre = case when ${t.nombre} <> '' then ${t.nombre} else nombre end,
            telefono = case when ${t.telefono} <> '' then ${t.telefono} else telefono end,
            detalle = case when ${t.detalle} <> '' then ${t.detalle} else detalle end
          where id = ${p.id}`;
        return { ok: true, transferencia: t, actualizada: true, instruccion: "Registrado. Decile al cliente que el equipo verifica el pago y le confirma a la brevedad. NUNCA afirmes que la plata ya llegó." };
      }
      await sql`insert into transferencias_max (chat_id, monto, nombre, telefono, detalle, comprobante)
        values (${t.chatId}, ${t.monto}, ${t.nombre}, ${t.telefono}, ${t.detalle}, ${t.comprobante})`;
    } catch (e) {
      console.log("⚠ no pude registrar la transferencia en la base:", e.message);
    }
  } else {
    const todas = leer(ARCHIVO, []);
    todas.push(t);
    guardar(ARCHIVO, todas);
  }
  return { ok: true, transferencia: t, instruccion: "Registrado. Decile al cliente que el equipo verifica el pago y le confirma a la brevedad. NUNCA afirmes que la plata ya llegó." };
}

/** Lista las transferencias recientes para el panel /admin de la web: una fila
 *  por gestión, con fecha, cliente, MONTO y si mandó comprobante. */
export async function listarTransferencias({ dias = 30, limite = 100 } = {}) {
  if (!usaDB) {
    const todas = leer(ARCHIVO, []);
    return todas.slice(-limite).reverse().map((t, i) => ({ id: i, ...t }));
  }
  try {
    await asegurarTabla();
    const filas = await sql`select id, chat_id, monto, nombre, telefono, detalle, comprobante, ts
      from transferencias_max
      where ts >= now() - (${dias} || ' days')::interval
      order by ts desc limit ${limite}`;
    return filas.map((f) => ({
      id: Number(f.id),
      chatId: f.chat_id || "",
      monto: Number(f.monto) || 0,
      nombre: f.nombre || "",
      telefono: f.telefono || "",
      detalle: f.detalle || "",
      comprobante: !!f.comprobante,
      ts: f.ts instanceof Date ? f.ts.toISOString() : String(f.ts),
    }));
  } catch (e) {
    console.log("⚠ no pude listar las transferencias:", e.message);
    return [];
  }
}

const cero = () => ({ gestiones: 0, comprobantes: 0 });

/** Resumen para el panel: gestiones por transferencia de Max (hoy / 7 / 30 días)
 *  y cuántas llegaron a comprobante enviado. */
export async function resumenTransferencias() {
  const vacio = { disponible: false, hoy: cero(), d7: cero(), d30: cero() };
  if (!usaDB) return vacio;
  try {
    await asegurarTabla();
    const [r] = await sql`
      select
        count(*) filter (
          where (ts at time zone 'America/Montevideo')
                >= date_trunc('day', now() at time zone 'America/Montevideo')) as g_hoy,
        count(*) filter (
          where comprobante and (ts at time zone 'America/Montevideo')
                >= date_trunc('day', now() at time zone 'America/Montevideo')) as c_hoy,
        count(*) filter (where ts >= now() - interval '7 days') as g_7,
        count(*) filter (where comprobante and ts >= now() - interval '7 days') as c_7,
        count(*) as g_30,
        count(*) filter (where comprobante) as c_30
      from transferencias_max
      where ts >= now() - interval '30 days'`;
    const n = (x) => Number(x) || 0;
    return {
      disponible: true,
      hoy: { gestiones: n(r?.g_hoy), comprobantes: n(r?.c_hoy) },
      d7: { gestiones: n(r?.g_7), comprobantes: n(r?.c_7) },
      d30: { gestiones: n(r?.g_30), comprobantes: n(r?.c_30) },
    };
  } catch (e) {
    console.log("⚠ no pude leer métricas de transferencias:", e.message);
    return vacio;
  }
}
