// Handler único e independiente del canal.
// Lo usan por igual el simulador, WhatsApp (Baileys) e Instagram.
import { responder } from "./cerebro.js";
import { historial, agregar } from "./memoria.js";
import { respuestaInstagram } from "./instagram.js";

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
  const { texto: respuesta, acciones, imagenesEnviar = [] } = await responder(texto, previo, imagenes, ctx);
  // En la memoria guardamos solo texto (no el base64 de la imagen, que es pesado).
  const marca = imagenes && imagenes.length ? (texto ? texto + " [+foto]" : "[el cliente mandó una foto]") : texto;
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
  agregar(chatId, "assistant", contenidoAssistant);
  return { texto: respuesta, acciones, imagenesEnviar };
}
