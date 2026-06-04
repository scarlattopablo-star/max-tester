// Instagram: NO vendemos por acá. Derivamos al WhatsApp humano, rápido y cálido.
// Respuesta instantánea (sin gastar IA) para que el cliente no pierda interés.
import { NEGOCIO, WA_LINK } from "./config.js";

const VARIANTES = [
  (saludo) =>
    `¡Hola! 🙌 Gracias por escribirnos. Para atenderte al toque y pasarte todo (modelos, fotos y precios) seguimos por WhatsApp acá 👉 ${WA_LINK}\nEscribinos y te respondemos en minutos 🚗`,
  (saludo) =>
    `¡Buenísimo que escribas! 😃 Te atendemos más rápido por WhatsApp, ahí coordinamos todo: ${WA_LINK}\nTe esperamos 👇`,
  (saludo) =>
    `¡Gracias por el mensaje! Para darte una mano ya mismo escribinos al WhatsApp ${NEGOCIO.whatsappHumano} 👉 ${WA_LINK} y vemos lo que necesitás 🚗✅`,
];

// turno: cantidad de mensajes previos del cliente (para variar el texto).
export function respuestaInstagram(turno = 0) {
  const v = VARIANTES[turno % VARIANTES.length];
  return v();
}
