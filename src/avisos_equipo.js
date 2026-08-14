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
import { dijoQueTransfirio } from "./ws_mensaje.js";

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

/** ¿Esta respuesta necesita atención del equipo? Los transportes lo usan para
 *  dejar el chat SIN LEER: así el asesor lo encuentra resaltado en la bandeja. */
export function pideAtencionDelEquipo(acciones = [], texto = "") {
  if ((acciones || []).some((a) => HERRAMIENTAS_QUE_AVISAN.includes(a.herramienta))) return true;
  return dijoQueTransfirio(texto);
}

const fmt = (n) => `$ ${new Intl.NumberFormat("es-UY").format(n)}`;

/** Arma los textos de los avisos. PURO (no manda nada): así se puede testear sin
 *  WhatsApp ni base de datos.
 *  Devuelve { avisos: [texto...], transferenciaSinRegistrar } — esto último es la
 *  transferencia que detectó la red de seguridad y que el llamador debe registrar. */
export function armarAvisos({ acciones = [], contacto = {}, texto = "", chatId = "", pdfRecibido = false, fallbackConversacion = "" } = {}) {
  const avisos = [];
  const lineaCliente = contacto.nombre ? `👤 ${contacto.nombre}` : "";
  const sinLink = fallbackConversacion || "Buscá la conversación del cliente en el WhatsApp del negocio.";
  // Mejor teléfono disponible: el capturado del mensaje, o el que trajo la herramienta.
  const linkA = (telExtra) => {
    const l = linkWa(contacto.tel || telExtra);
    return l ? `👉 ${l}` : sinLink;
  };
  const linkConversacion = linkA();

  const avisoTransferencia = (t = {}) => {
    const datosCliente = [t.nombre, t.telefono].filter(Boolean).join(" · ");
    return [
      t.comprobante
        ? "🏦 COMPROBANTE DE TRANSFERENCIA RECIBIDO — verificá que la plata esté en la cuenta"
        : "🏦 UN CLIENTE AVISA QUE TRANSFIRIÓ — verificá que la plata esté en la cuenta",
      t.monto ? `💵 Monto: ${fmt(t.monto)}` : "",
      t.detalle ? `📝 ${t.detalle}` : "",
      datosCliente ? `👤 ${datosCliente}` : lineaCliente,
      "⚠️ Max no ve la cuenta bancaria: el pago hay que confirmarlo a mano y avisarle al cliente.",
      `💬 Entrá a la conversación: ${linkA(t.telefono)}`,
    ].filter(Boolean).join("\n");
  };

  let transferenciaAvisada = false;

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
      avisos.push([
        "🛒 NUEVA VENTA — Max cerró un pedido",
        `Producto: ${p.producto || "?"}${p.modeloVehiculo ? ` · ${p.modeloVehiculo}` : ""}`,
        p.medioPago ? `💳 Pago: ${p.medioPago}` : "",
        lineaCliente || ([p.nombre, p.telefono].filter(Boolean).length ? `👤 ${[p.nombre, p.telefono].filter(Boolean).join(" · ")}` : ""),
        p.notas ? `📝 ${p.notas}` : "",
        `💬 Verificá el pago y coordiná la entrega: ${linkConversacion}`,
      ].filter(Boolean).join("\n"));

    } else if (a.herramienta === "confirmar_transferencia") {
      // SIEMPRE, aunque el pedido ya se haya avisado antes: este es el momento en
      // que el equipo tiene que ir a mirar la cuenta bancaria.
      avisos.push(avisoTransferencia(a.resultado?.transferencia || a.input || {}));
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
  // Dos disparadores, los dos por código (no dependen de que la IA acierte):
  //   1. el cliente dijo con todas las letras que YA transfirió;
  //   2. llegó un PDF — el comprobante del banco es un PDF y casi nada más lo es.
  // El (2) importa sobre todo porque el cliente suele mandar el PDF SOLO, sin
  // escribir nada, y ahí el disparador (1) no tiene texto donde engancharse.
  // Un aviso de más cuesta 10 segundos; una transferencia que nadie mira, una venta.
  let transferenciaSinRegistrar = null;
  if (!transferenciaAvisada && (dijoQueTransfirio(texto) || pdfRecibido)) {
    transferenciaSinRegistrar = {
      chatId,
      nombre: contacto.nombre || "",
      telefono: contacto.tel || "",
      detalle: String(texto).slice(0, 140),
      comprobante: pdfRecibido || /comprobante/i.test(texto),
    };
    avisos.push(avisoTransferencia(transferenciaSinRegistrar));
  }

  return { avisos, transferenciaSinRegistrar };
}

/** Arma y MANDA los avisos al WhatsApp del equipo. Un fallo en uno no tumba los
 *  otros: cada aviso se manda por separado y el error queda en el log. */
export async function avisarAcciones({ acciones = [], contacto = {}, texto = "", chatId = "", pdfRecibido = false, fallbackConversacion = "" } = {}) {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({ acciones, contacto, texto, chatId, pdfRecibido, fallbackConversacion });

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
