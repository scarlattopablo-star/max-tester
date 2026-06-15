// Aviso de venta web al WhatsApp del negocio. El sock de Baileys se registra
// desde whatsapp.js cuando la conexión abre; sin sock => 503 (la web no insiste).
import "./env.js";

let sockActivo = null;
let alEnviar = null; // callback de whatsapp.js: registra los IDs de los mensajes que manda el bot

export function registrarSock(sock, marcarEnviado) { sockActivo = sock; alEnviar = marcarEnviado || null; }
export function hayWhatsApp() { return !!sockActivo; }

// "091 629 784" -> "59891629784@s.whatsapp.net"
export function numeroAJid(numero) {
  let d = String(numero || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("598")) d = "598" + d;
  return `${d}@s.whatsapp.net`;
}

// "091 629 784" -> "https://wa.me/59891629784" (link directo a la conversación del cliente).
// Devuelve "" si el número no es válido, para no armar un link roto.
export function linkWa(numero) {
  let d = String(numero || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("598")) d = "598" + d;
  if (d.length < 10) return ""; // muy corto para ser un celular uruguayo
  return `https://wa.me/${d}`;
}

export function formatearAviso(p) {
  const fmt = (n) => `$ ${new Intl.NumberFormat("es-UY").format(n)}`;
  // Link a la conversación del cliente: SIEMPRE que tengamos un teléfono.
  const tel = p.cliente?.telefono || p.telefono || "";
  const link = linkWa(tel);
  const lineaLink = link ? `\n💬 Entrá a la conversación: ${link}` : "";
  // Venta cerrada por Max con su propio link de pago (la dispara el watcher de pagos).
  if (p.origen === "max") {
    return `💰 VENTA POR LINK DE PAGO DE MAX (Mercado Pago acreditado)\n${p.titulo || "Venta"}\nTotal: ${fmt(p.monto || 0)}\nRef: ${p.ref || "?"}${lineaLink}`;
  }
  const titulo = p.medio === "transferencia"
    ? "🏦 PEDIDO POR TRANSFERENCIA (esperando comprobante)"
    : "💰 NUEVA VENTA WEB (pagada con Mercado Pago)";
  const items = (p.items || [])
    .map((l) => `• ${l.qty}x ${l.nombre}${l.color ? ` · Color: ${l.color}` : ""} — ${fmt(l.precio_unit * l.qty)}`)
    .join("\n");
  const entrega = p.entrega === "dac"
    ? `📦 Envío DAC a: ${p.cliente?.direccion || "?"}, ${p.cliente?.ciudad || "?"}`
    : "🏪 Retiro en el local";
  const corto = String(p.orderId || "").slice(0, 8).toUpperCase();
  let msg = `${titulo}\nPedido #${corto}\n\n${items}\n\nTotal: ${fmt(p.total || 0)}\n${entrega}\n👤 ${p.cliente?.nombre || "?"} · ${p.cliente?.telefono || "?"}${lineaLink}`;
  // Pedidos por transferencia: botón (link) para confirmar cuando llega la plata.
  // Al tocarlo, el pedido pasa a PAGADO y se descuenta el stock en Mercado Libre.
  if (p.medio === "transferencia" && p.confirmarUrl) {
    msg += `\n\n✅ ¿Llegó la transferencia? Tocá acá para CONFIRMAR la venta (marca el pedido como pagado y baja el stock en ML):\n${p.confirmarUrl}`;
  }
  return msg;
}

export async function enviarAviso(pedido) {
  if (!sockActivo) {
    const e = new Error("whatsapp_desconectado");
    e.whatsapp = false;
    throw e;
  }
  const jid = numeroAJid(process.env.NUMERO_AVISOS || "091629784");
  const sent = await sockActivo.sendMessage(jid, { text: formatearAviso(pedido) });
  alEnviar?.(sent);
}

// Texto pelado al WhatsApp del negocio (lo usa Max para avisos sueltos, ej: derivación a humano).
export async function enviarTexto(texto) {
  if (!sockActivo) {
    const e = new Error("whatsapp_desconectado");
    e.whatsapp = false;
    throw e;
  }
  const jid = numeroAJid(process.env.NUMERO_AVISOS || "091629784");
  const sent = await sockActivo.sendMessage(jid, { text: texto });
  alEnviar?.(sent);
  console.log(`📢 aviso al equipo enviado a ${jid} (id ${sent?.key?.id || "?"})`);
}
