// Entry de producción: el server web SIEMPRE; WhatsApp solo si WHATSAPP_ON=1
// (así Pablo decide cuándo Max sale al aire, sin tocar código).
import "./web.js";
if (process.env.WHATSAPP_ON === "1") {
  import("./whatsapp.js");
}
