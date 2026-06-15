// Estado del QR de WhatsApp, para mostrarlo en una página web (en Render no hay
// terminal a mano). whatsapp.js lo actualiza con cada QR/conexión; web.js lo
// sirve en /qr para que el local lo escanee desde el navegador.
let _qr = null; // string del QR vigente (o null si ya no hay)
let _conectado = false;
let _ts = 0;

export function setQR(qr) {
  _qr = qr;
  _ts = Date.now();
}
export function setConectado(v) {
  _conectado = !!v;
  if (v) _qr = null; // ya conectado: no mostrar más el QR
  _ts = Date.now();
}
export function estadoQR() {
  return { qr: _qr, conectado: _conectado, ts: _ts };
}
