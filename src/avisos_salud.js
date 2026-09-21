// SALUD DEL CANAL DE AVISOS AL EQUIPO.
//
// Los avisos (derivación, venta, turno, TRANSFERENCIA) salen por la Cloud API y
// Meta contesta 200 ENSEGUIDA, antes de saber si el mensaje se puede entregar. Si
// después no se puede, lo avisa por el webhook con status=failed. Ese rebote es la
// ÚNICA señal de que el equipo se quedó sin avisos.
//
// El 18 sep 2026 el 096 895 164 empezó a rebotar todo con code 131026 ("Message
// undeliverable", un problema del teléfono destino, no del emisor). El rebote solo
// quedaba en el buffer de 60 eventos de /api/diag y en stdout de Render, así que
// pasaron 3 días con las derivaciones y las transferencias mudas sin que nadie lo
// notara. En ago 2026 la misma clase de falla duró 3 semanas.
//
// Este módulo guarda el texto de cada aviso que salió (para poder reintentarlo por
// otro número) y lleva la cuenta de rebotes seguidos, que es lo que distingue "un
// mensaje que no entró" de "el canal está cortado".

// id de Meta -> texto del aviso. Acotado: solo sirve para el rato que pasa entre
// el envío y el status del webhook (segundos), no es un historial.
const MAX_RECORDADOS = 100;
const textosPorId = new Map();

let consecutivos = 0; // rebotes seguidos sin ninguna entrega en el medio
let ultimoRebote = null; // { ts, code, detalle, texto }
let ultimoOk = null; // ts de la última vez que un aviso SÍ se entregó

/** Un aviso al equipo salió por la API. Guardamos el texto para poder reintentarlo
 *  si Meta lo rebota. Sin id (la API no lo devolvió) no hay nada que atar. */
export function recordarEnvio(id, texto) {
  if (!id) return;
  textosPorId.set(id, String(texto || ""));
  // Se descartan los más viejos: un status que llega tardísimo ya no se reintenta.
  while (textosPorId.size > MAX_RECORDADOS) {
    textosPorId.delete(textosPorId.keys().next().value);
  }
}

/** Meta confirmó la entrega de un aviso: el canal está vivo. */
export function marcarEntregado(id) {
  if (!id || !textosPorId.has(id)) return false;
  textosPorId.delete(id);
  consecutivos = 0;
  ultimoOk = Date.now();
  return true;
}

/** Meta rebotó un envío. Devuelve { esAviso, texto, consecutivos }: si el id no es
 *  de un aviso al equipo (un mensaje a un cliente, por ejemplo) no toca la salud
 *  del canal, porque si no un solo cliente con el teléfono mal apaga la alarma. */
export function marcarRebote(id, code, detalle = "") {
  if (!id || !textosPorId.has(id)) return { esAviso: false, texto: "", consecutivos };
  const texto = textosPorId.get(id);
  textosPorId.delete(id);
  consecutivos += 1;
  ultimoRebote = { ts: Date.now(), code: code ?? null, detalle: String(detalle || ""), texto };
  return { esAviso: true, texto, consecutivos };
}

/** Estado del canal, para /api/estado y el panel. `ok:false` significa que el
 *  último aviso rebotó: el equipo NO se está enterando de nada. */
export function salud() {
  return {
    ok: consecutivos === 0,
    consecutivos,
    ultimoRebote: ultimoRebote
      ? { cuando: new Date(ultimoRebote.ts).toISOString(), code: ultimoRebote.code, detalle: ultimoRebote.detalle }
      : null,
    ultimoOk: ultimoOk ? new Date(ultimoOk).toISOString() : null,
    recordados: textosPorId.size,
  };
}

/** Solo para los tests. */
export function reset() {
  textosPorId.clear();
  consecutivos = 0;
  ultimoRebote = null;
  ultimoOk = null;
}
