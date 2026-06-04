// Derivaciones a humano: cuando el bot decide que tiene que intervenir una persona.
import { leer, guardar } from "./store.js";

const ARCHIVO = "derivaciones.json";

export function listarDerivaciones() {
  return leer(ARCHIVO, []);
}

export function registrarDerivacion({ motivo, resumen, nombre, telefono }) {
  const lista = listarDerivaciones();
  const d = {
    id: "D" + (lista.length + 1).toString().padStart(4, "0"),
    motivo: motivo || "",
    resumen: resumen || "",
    nombre: nombre || "",
    telefono: telefono || "",
    estado: "pendiente",
    creado: new Date().toISOString(),
  };
  lista.push(d);
  guardar(ARCHIVO, lista);
  return { ok: true, derivacion: d };
}
