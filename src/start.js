// Entry de producción: el server web SIEMPRE.
//  - WA_PROVIDER=meta  → Max atiende por la Cloud API oficial (webhook montado en
//    web.js). NO se arranca Baileys (pelearían por el número).
//  - si no, y WHATSAPP_ON=1 → Max atiende por Baileys (whatsapp.js), como hasta ahora.
import "./web.js";
if (process.env.WA_PROVIDER !== "meta" && process.env.WHATSAPP_ON === "1") {
  import("./whatsapp.js");
}
