// Aviso de venta web al WhatsApp del negocio. El sock de Baileys se registra
// desde whatsapp.js cuando la conexión abre; sin sock => 503 (la web no insiste).
import "./env.js";

let sockActivo = null;

export function registrarSock(sock) { sockActivo = sock; }
export function hayWhatsApp() { return !!sockActivo; }

// "091 629 784" -> "59891629784@s.whatsapp.net"
export function numeroAJid(numero) {
  let d = String(numero || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("598")) d = "598" + d;
  return `${d}@s.whatsapp.net`;
}

export function formatearAviso(p) {
  const fmt = (n) => `$ ${new Intl.NumberFormat("es-UY").format(n)}`;
  const titulo = p.medio === "transferencia"
    ? "🏦 PEDIDO POR TRANSFERENCIA (esperando comprobante)"
    : "💰 NUEVA VENTA WEB (pagada con Mercado Pago)";
  const items = (p.items || [])
    .map((l) => `• ${l.qty}x ${l.nombre} — ${fmt(l.precio_unit * l.qty)}`)
    .join("\n");
  const entrega = p.entrega === "dac"
    ? `📦 Envío DAC a: ${p.cliente?.direccion || "?"}, ${p.cliente?.ciudad || "?"}`
    : "🏪 Retiro en el local";
  const corto = String(p.orderId || "").slice(0, 8).toUpperCase();
  return `${titulo}\nPedido #${corto}\n\n${items}\n\nTotal: ${fmt(p.total || 0)}\n${entrega}\n👤 ${p.cliente?.nombre || "?"} · ${p.cliente?.telefono || "?"}`;
}

export async function enviarAviso(pedido) {
  if (!sockActivo) {
    const e = new Error("whatsapp_desconectado");
    e.whatsapp = false;
    throw e;
  }
  const jid = numeroAJid(process.env.NUMERO_AVISOS || "091629784");
  await sockActivo.sendMessage(jid, { text: formatearAviso(pedido) });
}
