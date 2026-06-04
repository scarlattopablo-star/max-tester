// Memoria de conversación por chat (para que el bot recuerde el hilo).
import { leer, guardar } from "./store.js";

const ARCHIVO = "conversaciones.json";
const MAX_MENSAJES = 40; // cuántos mensajes recuerda (se guarda en disco, persiste si el cliente vuelve)

export function historial(chatId) {
  const todas = leer(ARCHIVO, {});
  return todas[chatId] || [];
}

export function agregar(chatId, rol, contenido) {
  const todas = leer(ARCHIVO, {});
  if (!todas[chatId]) todas[chatId] = [];
  todas[chatId].push({ role: rol, content: contenido });
  if (todas[chatId].length > MAX_MENSAJES) {
    todas[chatId] = todas[chatId].slice(-MAX_MENSAJES);
  }
  guardar(ARCHIVO, todas);
}

export function reiniciar(chatId) {
  const todas = leer(ARCHIVO, {});
  delete todas[chatId];
  guardar(ARCHIVO, todas);
}
