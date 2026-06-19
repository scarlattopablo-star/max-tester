// Agenda de turnos del local (Paysandú 944), guardada en Neon (sobrevive a los
// deploys/reinicios de Render). Max NO confirma turnos por su cuenta: registra
// la SOLICITUD (estado "pendiente") y el equipo la confirma. Ver whatsapp.js
// (aviso al equipo) y cerebro.js (herramienta solicitar_turno).
import "./env.js";
import { neon } from "@neondatabase/serverless";

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

async function prepararTabla() {
  await sql`create table if not exists turnos (
    id text primary key,
    nombre text,
    telefono text,
    servicio text,
    vehiculo text,
    fecha text,
    hora text,
    estado text default 'pendiente',
    creado timestamptz default now()
  )`;
}

/** Lista de turnos (para un futuro panel del equipo). Más nuevos primero. */
export async function listarTurnos() {
  try {
    await prepararTabla();
    return await sql`select * from turnos order by creado desc limit 200`;
  } catch {
    return [];
  }
}

/** Registra una SOLICITUD de turno (estado "pendiente"). NO confirma la hora:
 *  el equipo la confirma. Persiste en Neon. Devuelve {ok, turno} o {ok:false}. */
export async function solicitarTurno({ nombre, telefono, servicio, vehiculo, fecha, hora } = {}) {
  // Max NO le pide datos al cliente para agendar: pasa el pedido directo al
  // equipo, que coordina por la misma conversación (el aviso lleva el link).
  // Por eso nombre/teléfono son opcionales (el equipo los ve en el chat).
  const turno = {
    id: "T" + Date.now().toString(36).toUpperCase(),
    nombre: nombre || "",
    telefono: telefono || "",
    servicio: servicio || "Colocación / consulta",
    vehiculo: vehiculo || "",
    fecha: fecha || "",
    hora: hora || "",
    estado: "pendiente",
  };
  try {
    await prepararTabla();
    await sql`insert into turnos (id, nombre, telefono, servicio, vehiculo, fecha, hora, estado)
      values (${turno.id}, ${turno.nombre}, ${turno.telefono}, ${turno.servicio},
              ${turno.vehiculo}, ${turno.fecha}, ${turno.hora}, ${turno.estado})`;
  } catch (e) {
    console.log("⚠ no pude guardar la solicitud de turno:", e.message);
    // Igual devolvemos ok: el aviso al equipo (whatsapp.js) sigue saliendo.
  }
  return { ok: true, turno };
}
