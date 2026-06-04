// Agenda de turnos en el local (Paysandú 944).
import { leer, guardar } from "./store.js";
import { FRANJAS_TURNO } from "./config.js";

const ARCHIVO = "agenda.json";

export function listarTurnos() {
  return leer(ARCHIVO, []);
}

// Devuelve las franjas todavía libres para una fecha (YYYY-MM-DD).
export function disponibilidad(fecha) {
  const turnos = listarTurnos();
  const ocupadas = turnos.filter((t) => t.fecha === fecha && t.estado !== "cancelado").map((t) => t.hora);
  return FRANJAS_TURNO.filter((h) => !ocupadas.includes(h));
}

// Reserva un turno. Devuelve {ok, turno} o {ok:false, motivo}.
export function agendar({ nombre, telefono, servicio, fecha, hora, vehiculo }) {
  if (!nombre || !telefono || !fecha || !hora) {
    return { ok: false, motivo: "Faltan datos (nombre, teléfono, fecha u hora)." };
  }
  const libres = disponibilidad(fecha);
  if (!libres.includes(hora)) {
    return { ok: false, motivo: `La hora ${hora} del ${fecha} no está disponible. Libres: ${libres.join(", ") || "ninguna"}.` };
  }
  const turnos = listarTurnos();
  const turno = {
    id: "T" + (turnos.length + 1).toString().padStart(4, "0"),
    nombre,
    telefono,
    servicio: servicio || "Consulta",
    vehiculo: vehiculo || "",
    fecha,
    hora,
    estado: "confirmado",
    creado: new Date().toISOString(),
  };
  turnos.push(turno);
  guardar(ARCHIVO, turnos);
  return { ok: true, turno };
}
