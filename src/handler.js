// Handler único e independiente del canal.
// Lo usan por igual el simulador, WhatsApp (Baileys) e Instagram.
import { responder } from "./cerebro.js";
import { historial, agregar } from "./memoria.js";
import { respuestaInstagram } from "./instagram.js";
import { guardarComprobanteDataUri } from "./comprobantes.js";

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
    const ops = imagenesEnviar.map((f) => f.caption).join("; ");
    contenidoAssistant = `${respuesta}⁣[Contexto interno — opciones que le mostré al cliente con foto, numeradas: ${ops}. Si el cliente elige un número ("la 1", "el 2", "quiero la primera"), corresponde a ESTA lista; NO vuelvas a mostrar las opciones: avanzá con la que eligió.]`;
  }
  if (videosEnviar.length) {
    const vids = videosEnviar.map((v) => v.caption).join("; ");
    contenidoAssistant += `${contenidoAssistant.includes("⁣") ? " " : "⁣"}[Contexto interno — YA le envié el video de: ${vids} (con su material). Mientras se hable del MISMO auto/pedido, NO repitas ese video ni sus fotos; si el cliente pregunta después por OTRO modelo, ahí sí va la presentación completa de nuevo.]`;
  }
  agregar(chatId, "assistant", contenidoAssistant);
  return { texto: respuesta, acciones, imagenesEnviar, videosEnviar };
}
