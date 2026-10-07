// PEDIDOS WEB POR TRANSFERENCIA QUE ESPERAN EL COMPROBANTE (7 oct 2026).
//
// La tienda web avisaba al equipo (mail + WhatsApp) apenas el cliente elegía
// "transferencia" en el checkout, antes de que pagara. Ahora la web le deja el
// pedido a Max EN ESPERA (POST /api/notificar-venta con esperarComprobante) y no
// avisa a nadie. La página de gracias le pide al cliente que mande el comprobante
// por WhatsApp — a Max —, y cuando llega, el aviso del comprobante sale con el
// pedido web completo y el link para confirmar la venta (avisos_equipo.js).
//
// En Neon (tabla `pedidos_web_espera`) para sobrevivir a los reinicios de Render:
// entre el pedido y el comprobante pueden pasar horas o días. Sin DATABASE_URL
// (simulador / tests) cae a un archivo local.
import "./env.js";
import { neon } from "@neondatabase/serverless";
import { leer, guardar } from "./store.js";

const ARCHIVO = "pedidos_web_espera.json";
const usaDB = () => !!process.env.DATABASE_URL;
const DIAS_ESPERA = 14;

let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await sql`create table if not exists pedidos_web_espera (
    order_id text primary key,
    corto text,
    tel8 text,
    pedido jsonb,
    ts timestamptz default now(),
    avisado_ts timestamptz
  )`;
  tablaLista = true;
}

// Últimos 8 dígitos: el cliente escribe "099 123 456" en la web y WhatsApp trae
// "59899123456". Los 8 de la cola son el número en los dos.
export const tel8 = (t) => String(t || "").replace(/\D/g, "").slice(-8);
// "#2E35635E" — el código corto del pedido, el que va en el mensaje prearmado de
// la página de gracias ("Hice el pedido #2E35635E por transferencia").
const corto = (id) => String(id || "").slice(0, 8).toUpperCase();
const codigosEn = (texto) => [...String(texto || "").toUpperCase().matchAll(/#?\b([0-9A-F]{8})\b/g)].map((m) => m[1]);

/** Guarda un pedido web por transferencia hasta que llegue su comprobante. */
export async function guardarPedidoWebEnEspera(pedido = {}) {
  if (!pedido.orderId) return { ok: false, motivo: "falta orderId" };
  const fila = { orderId: String(pedido.orderId), corto: corto(pedido.orderId), tel8: tel8(pedido.cliente?.telefono), pedido, ts: new Date().toISOString(), avisado: false };
  if (usaDB()) {
    await asegurarTabla();
    await sql`insert into pedidos_web_espera (order_id, corto, tel8, pedido)
      values (${fila.orderId}, ${fila.corto}, ${fila.tel8}, ${JSON.stringify(pedido)}::jsonb)
      on conflict (order_id) do nothing`;
  } else {
    const todos = leer(ARCHIVO, []).filter((f) => f.orderId !== fila.orderId);
    todos.push(fila);
    guardar(ARCHIVO, todos);
  }
  return { ok: true, enEspera: true };
}

/** Pedidos web en espera de ESTE cliente: por su teléfono o por el código del
 *  pedido escrito en el mensaje. Nunca lanza (sin base, devuelve []). */
export async function pedidosWebDe({ telefono = "", texto = "" } = {}) {
  const t8 = tel8(telefono);
  const codigos = codigosEn(texto);
  if (t8.length < 8 && !codigos.length) return [];
  try {
    if (usaDB()) {
      await asegurarTabla();
      const filas = await sql`select order_id, pedido from pedidos_web_espera
        where avisado_ts is null and ts >= now() - (${DIAS_ESPERA} || ' days')::interval
          and ((${t8} <> '' and length(${t8}) = 8 and tel8 = ${t8}) or corto = any(${codigos}))
        order by ts`;
      return filas.map((f) => f.pedido);
    }
    const limite = Date.now() - DIAS_ESPERA * 864e5;
    return leer(ARCHIVO, [])
      .filter((f) => !f.avisado && Date.parse(f.ts) >= limite && ((t8.length === 8 && f.tel8 === t8) || codigos.includes(f.corto)))
      .map((f) => f.pedido);
  } catch (e) {
    console.log("⚠ no pude buscar pedidos web en espera:", e.message);
    return [];
  }
}

/** Marca los pedidos como avisados (el comprobante ya salió con ellos). */
export async function marcarPedidosWebAvisados(orderIds = []) {
  const ids = orderIds.map(String).filter(Boolean);
  if (!ids.length) return;
  try {
    if (usaDB()) {
      await asegurarTabla();
      await sql`update pedidos_web_espera set avisado_ts = now() where order_id = any(${ids})`;
      return;
    }
    guardar(ARCHIVO, leer(ARCHIVO, []).map((f) => (ids.includes(f.orderId) ? { ...f, avisado: true } : f)));
  } catch (e) {
    console.log("⚠ no pude marcar los pedidos web avisados:", e.message);
  }
}

/** Le pide a la web que mande el MAIL del comprobante (el mail sale por Resend,
 *  que vive en la web). Best effort: el aviso de WhatsApp ya salió. */
export async function pedirMailComprobante(orderId) {
  const base = (process.env.SITE_URL || process.env.WEB_URL || "https://lacasadelcubreasiento.com.uy").replace(/\/$/, "");
  const token = process.env.NOTIFY_TOKEN;
  if (!token || !orderId) return false;
  try {
    const r = await fetch(`${base}/api/aviso-comprobante`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok;
  } catch (e) {
    console.log("⚠ no pude pedir el mail del comprobante:", e.message);
    return false;
  }
}
