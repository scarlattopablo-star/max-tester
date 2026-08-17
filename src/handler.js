// Handler único e independiente del canal.
// Lo usan por igual el simulador, WhatsApp (Baileys) e Instagram.
import { responder } from "./cerebro.js";
import { historial, agregar } from "./memoria.js";
import { respuestaInstagram } from "./instagram.js";
import { guardarComprobanteDataUri } from "./comprobantes.js";
import { setOptIn } from "./clientes.js";

// El pie de la plantilla "volvio_stock_max" le promete al cliente que respondiendo
// BAJA deja de recibir avisos. Esto es lo que cumple esa promesa (y es lo que Meta
// espera de un mensaje de marketing). Solo dispara si el mensaje ES la baja: un
// "dame de baja el pedido" en medio de una charla no cuenta.
const PEDIDO_DE_BAJA = /^\s*(baja|stop|unsubscribe|cancelar|no quiero (mas|más) (avisos|mensajes)|dejen de (escribirme|mandarme)|no me escriban (mas|más))\s*[.!]?\s*$/i;
const RESPUESTA_BAJA = "Listo, no te mandamos más avisos 👍 Si en algún momento querés volver a saber de nosotros, escribinos cuando quieras.";

// canal: 'whatsapp' | 'simulador' | 'instagram' | 'web'
// imagenes: array de URLs/data-URIs que mandó el cliente (opcional)
// Devuelve { texto, acciones }
export async function procesarMensaje({ chatId, texto, canal = "whatsapp", imagenes = [], contacto = {} }) {
  if (canal === "instagram") {
    const previos = historial(chatId).filter((m) => m.role === "user").length;
    agregar(chatId, "user", texto || "(foto)");
    const respuesta = respuestaInstagram(previos);
    agregar(chatId, "assistant", respuesta);
    return { texto: respuesta, acciones: [] };
  }

  // Baja de avisos: se resuelve por código, sin pasar por la IA (una respuesta
  // improvisada acá no sirve: hay que dejar registrado el opt-out de verdad).
  if (PEDIDO_DE_BAJA.test(String(texto || ""))) {
    const tel = contacto?.tel || String(chatId || "").split("@")[0];
    try {
      await setOptIn(tel, false);
    } catch (e) {
      console.error("⚠ No pude registrar la baja de avisos:", e.message);
    }
    agregar(chatId, "user", texto);
    agregar(chatId, "assistant", RESPUESTA_BAJA);
    return { texto: RESPUESTA_BAJA, acciones: [{ herramienta: "baja_avisos" }] };
  }

  // WhatsApp / simulador / web: agente completo con IA.
  const previo = historial(chatId);
  // Contexto de la conversación para las herramientas (ej: crear_link_pago guarda
  // de qué charla/cliente vino la venta para avisar al equipo con ese dato).
  const ctx = { chatId, contacto };
  const { texto: respuesta, acciones, imagenesEnviar = [], videosEnviar = [] } = await responder(texto, previo, imagenes, ctx);
  // Guardamos los comprobantes (imágenes/PDF) que mandó el cliente y dejamos un
  // marcador liviano con el id en el historial (el base64 NO va al historial: es
  // pesado y el modelo no lo necesita). Si no se pudo guardar (sin base, muy grande),
  // se conserva el texto de siempre. El visor de conversaciones muestra los archivos.
  let marcadores = "";
  for (const dataUri of imagenes || []) {
    const id = await guardarComprobanteDataUri(chatId, dataUri);
    if (id) marcadores += ` ${/^data:application\/pdf/i.test(dataUri) ? `[comprobante-pdf #${id}]` : `[comprobante #${id}]`}`;
  }
  const marca = imagenes && imagenes.length
    ? (marcadores ? `${texto ? texto + " " : ""}${marcadores.trim()}` : (texto ? texto + " [+foto]" : "[el cliente mandó una foto]"))
    : texto;
  agregar(chatId, "user", marca);
  // IMPORTANTE: si Max mostró opciones con foto numeradas, las registramos como CONTEXTO
  // interno en el historial (después del separador ⁣) para que en el próximo turno
  // el LLM sepa qué es "la 1", "la 2", etc. El cliente NO ve esto (se recorta en /api/history
  // y nunca se le envía como mensaje; solo vive en la memoria que lee el modelo).
  let contenidoAssistant = respuesta;
  if (imagenesEnviar.length) {
    // Al caption se le agrega la LÍNEA desde la que se mostró la foto cuando no
    // coincide con lo que dice el rótulo (las muestras de costura son fotos del
    // capitoneado y también se usan al ofrecer el eco cuero). Va SOLO acá adentro,
    // en la nota interna: el cliente ve el caption pelado.
    const ops = imagenesEnviar
      .map((f) => (f.lineas?.length ? `${f.caption} (línea: ${f.lineas.join(" y ")})` : f.caption))
      .join("; ");
    contenidoAssistant = `${respuesta}⁣[Contexto interno — opciones que le mostré al cliente con foto, numeradas: ${ops}. Si el cliente elige un número ("la 1", "el 2", "quiero la primera"), corresponde a ESTA lista; NO vuelvas a mostrar las opciones: avanzá con la que eligió.]`;
  }
  if (videosEnviar.length) {
    const vids = videosEnviar.map((v) => v.caption).join("; ");
    contenidoAssistant += `${contenidoAssistant.includes("⁣") ? " " : "⁣"}[Contexto interno — YA le envié el video de: ${vids} (con su material). Mientras se hable del MISMO auto/pedido, NO repitas ese video ni sus fotos; si el cliente pregunta después por OTRO modelo, ahí sí va la presentación completa de nuevo.]`;
  }
  agregar(chatId, "assistant", contenidoAssistant);
  return { texto: respuesta, acciones, imagenesEnviar, videosEnviar };
}
