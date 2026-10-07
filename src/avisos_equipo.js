// AVISOS AL EQUIPO — única fuente de verdad.
//
// Cuando Max deriva a un asesor, cierra un pedido, pide un turno o registra una
// TRANSFERENCIA, el equipo tiene que enterarse por WhatsApp. Antes esta lógica
// estaba DUPLICADA en whatsapp.js (Baileys) y whatsapp_meta.js (Cloud API), y las
// dos copias se desincronizaron: al pasar a Meta el 22 jul 2026 se portaron 3 de
// los 4 avisos y las transferencias quedaron MUDAS 3 semanas (32 gestiones: los
// clientes mandaban el comprobante, quedaba registrado en el panel, y nadie del
// equipo recibía nada).
//
// Por eso ahora hay UN SOLO armador de avisos y los transportes solo lo llaman.
// Si se agrega una herramienta que debe avisar, va en HERRAMIENTAS_QUE_AVISAN y
// el test de cobertura (avisos_equipo.test.mjs) obliga a escribirle el aviso.
import { enviarTexto, linkWa } from "./notificador.js";
import { linkTurno } from "./confirmacion_turno.js";
import { dijoQueTransfirio, maxVioUnComprobante, esPagoPorTransferencia } from "./ws_mensaje.js";
import { pedidosWebDe, marcarPedidosWebAvisados, pedirMailComprobante } from "./pedidos_web_espera.js";

/** Herramientas del cerebro que SIEMPRE generan un aviso al equipo. */
export const HERRAMIENTAS_QUE_AVISAN = Object.freeze([
  "derivar_a_humano",
  "tomar_pedido",
  "solicitar_turno",
  "confirmar_transferencia",
]);

// Dedup de avisos ya mandados (un pedido/turno se avisa UNA vez aunque el turno
// del cerebro se reprocese). Las transferencias NO se deduplican: avisar de más
// es barato, no enterarse de una plata que entró no.
const pedidosAvisados = new Set();
const turnosAvisados = new Set();

// ⛔ TRANSFERENCIAS: AL EQUIPO SOLO CON EL COMPROBANTE EN LA MANO (7 oct 2026).
// Antes se avisaba con el "ya transferí" o con el pedido por transferencia, y el
// equipo salía a cerrar ventas cuya plata nunca aparecía. Ahora:
//   · "ya transferí" sin comprobante → se REGISTRA (queda en /admin) pero NO avisa;
//   · pedido por transferencia → queda EN ESPERA (sin aviso) atado al chat;
//   · llega el comprobante → UN aviso, con el pedido en espera adentro, para cerrar.
const pedidosEsperandoComprobante = new Map(); // chatId -> [pedido]
const ESPERA_MAX_MS = 7 * 24 * 60 * 60 * 1000;

/** ¿Esta acción le manda un aviso al equipo? (las transferencias, solo con comprobante) */
function accionAvisa(a) {
  if (!HERRAMIENTAS_QUE_AVISAN.includes(a?.herramienta)) return false;
  if (a.herramienta === "confirmar_transferencia") {
    return !!(a.resultado?.transferencia?.comprobante ?? a.input?.comprobante);
  }
  if (a.herramienta === "tomar_pedido") return !esPagoPorTransferencia(a.resultado?.pedido?.medioPago);
  return true;
}

/** ¿Esta respuesta necesita atención del equipo? Los transportes lo usan para
 *  dejar el chat SIN LEER: así el asesor lo encuentra resaltado en la bandeja.
 *  Un "ya transferí" sin comprobante NO: todavía no hay nada que cerrar. */
export function pideAtencionDelEquipo(acciones = [], _texto = "") {
  return (acciones || []).some(accionAvisa);
}

const fmt = (n) => `$ ${new Intl.NumberFormat("es-UY").format(n)}`;

/** Arma los textos de los avisos. PURO (no manda nada): así se puede testear sin
 *  WhatsApp ni base de datos.
 *  Devuelve { avisos: [texto...], transferenciaSinRegistrar } — esto último es la
 *  transferencia que detectó la red de seguridad y que el llamador debe registrar. */
export function armarAvisos({ acciones = [], contacto = {}, texto = "", chatId = "", pdfRecibido = false, fotoRecibida = false, respuestaMax = "", comprobanteExterno = "", fallbackConversacion = "", pedidosWeb = [] } = {}) {
  const avisos = [];
  const lineaCliente = contacto.nombre ? `👤 ${contacto.nombre}` : "";
  const sinLink = fallbackConversacion || "Buscá la conversación del cliente en el WhatsApp del negocio.";
  // Mejor teléfono disponible: el capturado del mensaje, o el que trajo la herramienta.
  const linkA = (telExtra) => {
    const l = linkWa(contacto.tel || telExtra);
    return l ? `👉 ${l}` : sinLink;
  };
  const linkConversacion = linkA();

  // Pedido de la TIENDA WEB que esperaba este comprobante: va entero, con el link
  // que lo marca pagado y baja el stock en ML (el mismo que antes iba al checkout).
  const lineasPedidoWeb = (w) => [
    `🌐 Pedido WEB #${String(w.orderId || "").slice(0, 8).toUpperCase()} — Total ${fmt(w.total || 0)}`,
    ...(w.items || []).map((l) => `   • ${l.qty}x ${l.nombre}${l.color ? ` · ${l.color}` : ""}`),
    w.entrega === "dac"
      ? `   📦 Envío DAC a: ${w.cliente?.direccion || "?"}, ${w.cliente?.ciudad || "?"}`
      : "   🏪 Retiro en el local",
    w.cliente?.nombre ? `   👤 ${[w.cliente.nombre, w.cliente.telefono].filter(Boolean).join(" · ")}` : "",
    w.confirmarUrl ? `   ✅ Si la plata llegó, CONFIRMÁ la venta acá (marca pagado y baja el stock en ML): ${w.confirmarUrl}` : "",
  ].filter(Boolean).join("\n");

  const avisoTransferencia = (t = {}, pedidos = [], web = []) => {
    const datosCliente = [t.nombre, t.telefono].filter(Boolean).join(" · ");
    return [
      pedidos.length || web.length
        ? "🏦 COMPROBANTE DE TRANSFERENCIA RECIBIDO — verificá la plata y cerrá la venta"
        : "🏦 COMPROBANTE DE TRANSFERENCIA RECIBIDO — verificá que la plata esté en la cuenta",
      t.monto ? `💵 Monto: ${fmt(t.monto)}` : "",
      ...pedidos.map((p) => `🛒 Pedido: ${p.producto || "?"}${p.modeloVehiculo ? ` · ${p.modeloVehiculo}` : ""}${p.notas ? ` · ${p.notas}` : ""}`),
      ...web.map(lineasPedidoWeb),
      t.detalle ? `📝 ${t.detalle}` : "",
      datosCliente ? `👤 ${datosCliente}` : lineaCliente,
      "⚠️ Max no ve la cuenta bancaria: el pago hay que confirmarlo a mano y avisarle al cliente.",
      `💬 Entrá a la conversación: ${linkA(t.telefono)}`,
    ].filter(Boolean).join("\n");
  };

  // Transferencias de este turno: se avisan al FINAL, así el pedido en espera
  // entra en el aviso aunque tomar_pedido venga después en la lista.
  let transferenciaAvisada = false;
  const comprobantes = [];

  for (const a of acciones || []) {
    if (a.herramienta === "derivar_a_humano") {
      const d = a.resultado?.derivacion || a.input || {};
      const link = linkA(d.telefono);
      avisos.push((d.motivo === "pide_humano"
        ? ["🙋 UN CLIENTE PIDE HABLAR CON UN ASESOR", d.resumen ? `📝 ${d.resumen}` : "", lineaCliente, `💬 Entrá a la conversación: ${link}`]
        : ["❓ MAX NO PUDO RESOLVER — necesita un asesor", `Motivo: ${d.motivo || "otro"}${d.resumen ? ` · ${d.resumen}` : ""}`, lineaCliente, `💬 Entrá a la conversación: ${link}`]
      ).filter(Boolean).join("\n"));

    } else if (a.herramienta === "tomar_pedido") {
      const p = a.resultado?.pedido;
      if (!p || pedidosAvisados.has(p.id)) continue;
      pedidosAvisados.add(p.id);
      if (esPagoPorTransferencia(p.medioPago)) {
        // Sin comprobante no hay venta que cerrar: espera, y sale con el comprobante.
        const enEspera = (pedidosEsperandoComprobante.get(chatId) || [])
          .filter((x) => Date.now() - x.ts < ESPERA_MAX_MS);
        enEspera.push({ ...p, ts: Date.now() });
        pedidosEsperandoComprobante.set(chatId, enEspera);
        continue;
      }
      avisos.push([
        "🛒 NUEVA VENTA — Max cerró un pedido",
        `Producto: ${p.producto || "?"}${p.modeloVehiculo ? ` · ${p.modeloVehiculo}` : ""}`,
        p.medioPago ? `💳 Pago: ${p.medioPago}` : "",
        lineaCliente || ([p.nombre, p.telefono].filter(Boolean).length ? `👤 ${[p.nombre, p.telefono].filter(Boolean).join(" · ")}` : ""),
        p.notas ? `📝 ${p.notas}` : "",
        `💬 Verificá el pago y coordiná la entrega: ${linkConversacion}`,
      ].filter(Boolean).join("\n"));

    } else if (a.herramienta === "confirmar_transferencia") {
      // Ya quedó registrada (la herramienta lo hace). Al equipo va SOLO si trae
      // el comprobante: este es el momento en que tiene que mirar la cuenta.
      const t = a.resultado?.transferencia || a.input || {};
      if (t.comprobante) comprobantes.push(t);
      transferenciaAvisada = true;

    } else if (a.herramienta === "solicitar_turno") {
      const tr = a.resultado?.turno;
      if (!tr || turnosAvisados.has(tr.id)) continue;
      turnosAvisados.add(tr.id);
      const cuando = [tr.fecha, tr.hora].filter(Boolean).join(" ");
      avisos.push([
        "🗓️ SOLICITUD DE TURNO — confirmá el día y la hora con el cliente",
        `👤 ${[tr.nombre, tr.telefono].filter(Boolean).join(" · ") || "(sin datos)"}`,
        tr.servicio ? `🔧 ${tr.servicio}` : "",
        tr.vehiculo ? `🚗 ${tr.vehiculo}` : "",
        cuando ? `📅 Prefiere: ${cuando}` : "📅 Sin preferencia de horario",
        `💬 Entrá a la conversación: ${linkConversacion}`,
        `✅ Cuando lo coordines con el cliente, confirmalo acá: ${linkTurno(tr.id, "confirmado")}`,
        `❌ Cancelar el turno: ${linkTurno(tr.id, "cancelado")}`,
      ].filter(Boolean).join("\n"));
    }
  }

  // RED DE SEGURIDAD determinística, para cuando el modelo NO llama la herramienta.
  // TRES disparadores, los tres por código (no dependen de que la IA acierte):
  //   1. el cliente dijo con todas las letras que YA transfirió;
  //   2. llegó un PDF — el comprobante del banco es un PDF y casi nada más lo es;
  //   3. llegó una FOTO y Max dijo que vio un pago en ella.
  // El (2) importa sobre todo porque el cliente suele mandar el PDF SOLO, sin
  // escribir nada, y ahí el disparador (1) no tiene texto donde engancharse.
  // El (3) se agregó el 21 sep 2026: un ticket de Abitab fotografiado (o una
  // captura de la app del banco) no es texto ni PDF, así que se colaba entre los
  // dos primeros. Pasó: $1.000 que Max vio, dijo que pasaba al equipo, y nadie
  // registró. Mira lo que Max DIJO, no que haya llamado la herramienta.
  // Un aviso de más cuesta 10 segundos; una transferencia que nadie mira, una venta.
  //   4. comprobanteExterno: el llamador YA decidió que hay un comprobante y dice
  //      por qué. Lo usa el chat que tomó un asesor, donde Max no razona y por
  //      lo tanto los disparadores 1 a 3 no tienen de dónde agarrarse.
  const comprobanteEnFoto = fotoRecibida && maxVioUnComprobante(respuestaMax);
  const detalleFoto = comprobanteEnFoto && !texto
    ? `Comprobante en FOTO. Max vio: ${String(respuestaMax).replace(/\s+/g, " ").slice(0, 110)}`
    : "";
  let transferenciaSinRegistrar = null;
  if (!transferenciaAvisada && (dijoQueTransfirio(texto) || pdfRecibido || comprobanteEnFoto || comprobanteExterno)) {
    transferenciaSinRegistrar = {
      chatId,
      nombre: contacto.nombre || "",
      telefono: contacto.tel || "",
      detalle: [comprobanteExterno, detalleFoto, String(texto).trim()].filter(Boolean).join(" · ").slice(0, 200),
      // Comprobante = un ARCHIVO que llegó. "Te pasé el comprobante" escrito sin
      // adjunto no lo es: se registra, pero el aviso espera al comprobante real.
      comprobante: pdfRecibido || comprobanteEnFoto || !!comprobanteExterno || (fotoRecibida && /comprobante/i.test(texto)),
    };
    if (transferenciaSinRegistrar.comprobante) comprobantes.push(transferenciaSinRegistrar);
  }

  let pedidosWebAvisados = [];
  if (comprobantes.length) {
    const pedidos = pedidosEsperandoComprobante.get(chatId) || [];
    pedidosEsperandoComprobante.delete(chatId);
    pedidosWebAvisados = pedidosWeb || [];
    comprobantes.forEach((t, i) => avisos.push(avisoTransferencia(t, i === 0 ? pedidos : [], i === 0 ? pedidosWebAvisados : [])));
  }

  return { avisos, transferenciaSinRegistrar, pedidosWebAvisados };
}

/** Arma y MANDA los avisos al WhatsApp del equipo. Un fallo en uno no tumba los
 *  otros: cada aviso se manda por separado y el error queda en el log. */
export async function avisarAcciones({ acciones = [], contacto = {}, texto = "", chatId = "", pdfRecibido = false, fotoRecibida = false, respuestaMax = "", comprobanteExterno = "", fallbackConversacion = "" } = {}) {
  // Pedidos de la tienda web de este cliente que esperan el comprobante. Solo se
  // buscan si en este turno PUEDE haber un comprobante (adjunto o herramienta).
  const puedeHaberComprobante = pdfRecibido || fotoRecibida || !!comprobanteExterno
    || (acciones || []).some((a) => a.herramienta === "confirmar_transferencia");
  const pedidosWeb = puedeHaberComprobante
    ? await pedidosWebDe({ telefono: contacto.tel || chatId, texto }).catch(() => [])
    : [];
  const { avisos, transferenciaSinRegistrar, pedidosWebAvisados } = armarAvisos({ acciones, contacto, texto, chatId, pdfRecibido, fotoRecibida, respuestaMax, comprobanteExterno, fallbackConversacion, pedidosWeb });

  if (pedidosWebAvisados.length) {
    await marcarPedidosWebAvisados(pedidosWebAvisados.map((w) => w.orderId));
    // El mail lo manda la web (Resend vive allá): ahora sí, con el comprobante.
    for (const w of pedidosWebAvisados) await pedirMailComprobante(w.orderId);
  }

  if (transferenciaSinRegistrar) {
    try {
      const { registrarTransferencia } = await import("./transferencias.js");
      await registrarTransferencia(transferenciaSinRegistrar);
      console.log(`🏦 ${chatId}: transferencia por red de seguridad (el modelo no llamó la herramienta)`);
    } catch (e) {
      console.log(`⚠ No pude registrar la transferencia (red de seguridad): ${e.message}`);
    }
  }

  for (const aviso of avisos) {
    try {
      await enviarTexto(aviso);
    } catch (e) {
      // Visible en /api/diag como envio_fallido: un aviso que no sale es plata en riesgo.
      console.log(`⚠ NO PUDE AVISAR AL EQUIPO: ${e.message} — aviso: ${aviso.slice(0, 60)}`);
    }
  }
  return avisos.length;
}
