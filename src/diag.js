// Diagnóstico en vivo del canal de WhatsApp: un registro circular en memoria con los
// últimos eventos de mensajes entrantes (¿llegó?, ¿era de un anuncio?, ¿se respondió?,
// ¿hubo error?). Lo llena whatsapp.js y lo sirve web.js en /api/diag para entender,
// sin pelear con los logs de Render, por qué Max no contesta algo. Es solo memoria:
// se vacía al reiniciar (suficiente para diagnosticar acá y ahora).
const MAX = 60;
const eventos = []; // { ts, tipo, jid, detalle }

export function diag(tipo, datos = {}) {
  eventos.push({ ts: Date.now(), tipo, ...datos });
  if (eventos.length > MAX) eventos.splice(0, eventos.length - MAX);
}

export function ultimosEventos() {
  return eventos.slice().reverse(); // más nuevo primero
}
