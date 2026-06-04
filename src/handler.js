// Handler único e independiente del canal.
// Lo usan por igual el simulador, WhatsApp (Baileys) e Instagram.
import { responder } from "./cerebro.js";
import { historial, agregar } from "./memoria.js";
import { respuestaInstagram } from "./instagram.js";

// canal: 'whatsapp' | 'simulador' | 'instagram' | 'web'
// imagenes: array de URLs/data-URIs que mandó el cliente (opcional)
// Devuelve { texto, acciones }
export async function procesarMensaje({ chatId, texto, canal = "whatsapp", imagenes = [] }) {
  if (canal === "instagram") {
    const previos = historial(chatId).filter((m) => m.role === "user").length;
    agregar(chatId, "user", texto || "(foto)");
    const respuesta = respuestaInstagram(previos);
    agregar(chatId, "assistant", respuesta);
    return { texto: respuesta, acciones: [] };
  }

  // WhatsApp / simulador / web: agente completo con IA.
  const previo = historial(chatId);
  const { texto: respuesta, acciones } = await responder(texto, previo, imagenes);
  // En la memoria guardamos solo texto (no el base64 de la imagen, que es pesado).
  const marca = imagenes && imagenes.length ? (texto ? texto + " [+foto]" : "[el cliente mandó una foto]") : texto;
  agregar(chatId, "user", marca);
  agregar(chatId, "assistant", respuesta);
  return { texto: respuesta, acciones };
}
