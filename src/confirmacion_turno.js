// Link de confirmación de turno que viaja en el aviso de WhatsApp al equipo.
// El token se deriva del id del turno + NOTIFY_TOKEN (el mismo secreto que valida
// la web en src/lib/confirmacion-turno.ts), así el equipo confirma con un solo toque
// sin entrar al panel y nadie puede fabricar el link sin el secreto.
import "./env.js";
import { createHash } from "crypto";
import { NEGOCIO } from "./config.js";

export function tokenTurno(id) {
  const secret = process.env.NOTIFY_TOKEN || "";
  return createHash("sha256").update(`turno:${id}:${secret}`).digest("hex").slice(0, 20);
}

export function linkTurno(id, estado = "confirmado") {
  const base = (NEGOCIO.web || "https://lacasadelcubreasiento.com.uy").replace(/\/$/, "");
  return `${base}/api/turno?id=${encodeURIComponent(id)}&estado=${estado}&t=${tokenTurno(id)}`;
}
