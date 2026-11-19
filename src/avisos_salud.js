// SALUD DEL CANAL DE AVISOS AL EQUIPO.
//
// Los avisos (derivación, venta, turno, TRANSFERENCIA) salen por la Cloud API y
// Meta contesta 200 ENSEGUIDA, antes de saber si el mensaje se puede entregar. Si
// después no se puede, lo avisa por el webhook con status=failed. Ese rebote es la
// ÚNICA señal de que el equipo se quedó sin avisos.
//
// HISTORIA (para que no vuelva a pasar):
//  · ago 2026: los avisos se perdieron 3 semanas (ventana de 24 h, code 131047).
//  · 18 sep 2026: el número de avisos empezó a rebotar todo con code 131026
//    ("Message undeliverable"). El 21 sep se agregó este módulo y avisos.ok en
//    /api/estado... pero NADIE miraba /api/estado. Resultado: el 19 nov se
//    encontró la alarma prendida con 470 rebotes seguidos y ningún aviso entregado
//    desde el 27 oct (probablemente desde el 18 sep). Dos meses de derivaciones y
//    transferencias mudas.
//
// Por eso ahora:
//  1. Los avisos salen a TODOS los números de destinosAvisos() (NUMERO_AVISOS puede
//     ser una lista + NUMERO_AVISOS_RESPALDO): un teléfono muerto ya no deja mudo
//     al equipo.
//  2. La salud se lleva POR NÚMERO: un destino que rebota se ve aunque otro ande.
//  3. El workflow `alarma-avisos` de GitHub lee esto cada ~30 min y, si algo
//     rebota, abre un issue y falla → le llega un MAIL a Pablo. La alarma ya no
//     depende de que alguien entre a mirar ni de WhatsApp (que es justo lo roto).

import { aWaId } from "./meta_api.js";

// A partir de cuántos rebotes seguidos un número se da por CAÍDO (y no un mensaje suelto).
export const REBOTES_PARA_CAIDO = 3;

// id de Meta -> { texto, destino }. Acotado: solo sirve para el rato que pasa
// entre el envío y el status del webhook (segundos), no es un historial.
const MAX_RECORDADOS = 200;
const porId = new Map();

// destino -> { consecutivos, ultimoOk, ultimoRebote, enviados }
const porDestino = new Map();

function fichaDe(destino) {
  const k = destino || "?";
  if (!porDestino.has(k)) porDestino.set(k, { consecutivos: 0, ultimoOk: null, ultimoRebote: null, enviados: 0 });
  return porDestino.get(k);
}

/** "096895164" -> "…164": en /api/estado (público) no se publica el número entero. */
export function enmascarar(numero) {
  const d = String(numero || "").replace(/\D/g, "");
  return d ? `…${d.slice(-3)}` : "?";
}

// Número del propio bot, aprendido del webhook (value.metadata.display_phone_number).
// Hace falta porque NUMERO_BOT casi nunca está cargado en Render, y el default viejo
// de NUMERO_AVISOS era justo el 091 = el número de Max: se mandaba los avisos a sí
// mismo y Meta los rebotaba todos con 131026.
let propioAprendido = "";
export function aprenderNumeroPropio(numero) {
  const n = aWaId(numero || "");
  if (n) propioAprendido = n;
}
export function numeroPropioBot(env = process.env) {
  return aWaId(env.NUMERO_BOT || "") || propioAprendido;
}

/**
 * A qué números mandar cada aviso. Parte PURA (recibe el env para poder testearla).
 * NUMERO_AVISOS admite varios separados por coma; NUMERO_AVISOS_RESPALDO se suma.
 * El número del PROPIO bot (NUMERO_BOT) se descarta: mandarse un mensaje a uno
 * mismo rebota siempre con 131026 — y en Coexistence el equipo ya ve esas charlas
 * en la app del celular, así que un aviso ahí no le sirve a nadie.
 * Devuelve { destinos, descartados: [{numero, motivo}] }.
 */
export function destinosAvisos(env = process.env) {
  const crudos = [
    ...String(env.NUMERO_AVISOS || "").split(/[,;\s]+/),
    ...String(env.NUMERO_AVISOS_RESPALDO || "").split(/[,;\s]+/),
  ].filter((x) => x && /\d/.test(x));
  const propio = numeroPropioBot(env);
  const destinos = [];
  const descartados = [];
  for (const c of crudos) {
    const n = aWaId(c);
    if (!n || destinos.includes(n)) continue;
    if (propio && n === propio) {
      descartados.push({ numero: n, motivo: "es el número del propio bot (rebota siempre)" });
      continue;
    }
    destinos.push(n);
  }
  return { destinos, descartados };
}

/** Un aviso al equipo salió por la API hacia `destino`. Se guarda el id para atar
 *  el status del webhook. Sin id (la API no lo devolvió) no hay nada que atar. */
export function recordarEnvio(id, texto, destino = "?") {
  if (!id) return;
  porId.set(id, { texto: String(texto || ""), destino: String(destino || "?") });
  fichaDe(String(destino || "?")).enviados += 1;
  while (porId.size > MAX_RECORDADOS) porId.delete(porId.keys().next().value);
}

/** Meta confirmó la entrega de un aviso: ese número está vivo. */
export function marcarEntregado(id) {
  if (!id || !porId.has(id)) return false;
  const { destino } = porId.get(id);
  porId.delete(id);
  const f = fichaDe(destino);
  f.consecutivos = 0;
  f.ultimoOk = Date.now();
  return true;
}

/** Meta rebotó un envío. Devuelve { esAviso, texto, destino, consecutivos }. Si el
 *  id no es de un aviso al equipo (un mensaje a un cliente, por ejemplo) no toca la
 *  salud, porque si no un solo cliente con el teléfono mal prende la alarma. */
export function marcarRebote(id, code, detalle = "") {
  if (!id || !porId.has(id)) return { esAviso: false, texto: "", destino: "", consecutivos: 0 };
  const { texto, destino } = porId.get(id);
  porId.delete(id);
  const f = fichaDe(destino);
  f.consecutivos += 1;
  f.ultimoRebote = { ts: Date.now(), code: code ?? null, detalle: String(detalle || "") };
  return { esAviso: true, texto, destino, consecutivos: f.consecutivos };
}

const iso = (ts) => (ts ? new Date(ts).toISOString() : null);

/**
 * Estado del canal, para /api/estado y el workflow de alarma.
 *  ok:false  → algún número de avisos está rebotando: hay que arreglarlo.
 *  mudo:true → NINGÚN número está recibiendo: el equipo no se entera de nada.
 * `configDestinos` (opcional) es la salida de destinosAvisos(), para mostrar qué
 * está configurado y avisar si no hay ningún destino válido.
 */
export function salud(configDestinos = null) {
  const fichas = [...porDestino.entries()];
  const caidos = fichas.filter(([, f]) => f.consecutivos > 0);
  const vivos = fichas.filter(([, f]) => f.consecutivos === 0 && f.ultimoOk);
  const peor = caidos.reduce((m, [, f]) => Math.max(m, f.consecutivos), 0);
  const ultimoRebote = fichas
    .map(([, f]) => f.ultimoRebote)
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts)[0];
  const ultimoOk = fichas.reduce((m, [, f]) => Math.max(m, f.ultimoOk || 0), 0);
  const sinDestinos = configDestinos ? configDestinos.destinos.length === 0 : false;

  const out = {
    ok: caidos.length === 0 && !sinDestinos,
    mudo: sinDestinos || (caidos.length > 0 && vivos.length === 0),
    consecutivos: peor,
    ultimoRebote: ultimoRebote
      ? { cuando: iso(ultimoRebote.ts), code: ultimoRebote.code, detalle: ultimoRebote.detalle }
      : null,
    ultimoOk: iso(ultimoOk),
    recordados: porId.size,
    destinos: fichas.map(([n, f]) => ({
      numero: enmascarar(n),
      ok: f.consecutivos === 0,
      consecutivos: f.consecutivos,
      enviados: f.enviados,
      ultimoOk: iso(f.ultimoOk),
      ultimoRebote: f.ultimoRebote ? { cuando: iso(f.ultimoRebote.ts), code: f.ultimoRebote.code } : null,
    })),
  };
  if (configDestinos) {
    out.configurados = configDestinos.destinos.map(enmascarar);
    out.descartados = configDestinos.descartados.map((d) => ({ numero: enmascarar(d.numero), motivo: d.motivo }));
    if (sinDestinos) out.problema = "No hay ningún número válido en NUMERO_AVISOS / NUMERO_AVISOS_RESPALDO";
  }
  return out;
}

/** Solo para los tests. */
export function reset() {
  propioAprendido = "";
  porId.clear();
  porDestino.clear();
}
