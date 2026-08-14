// Entry de producción: el server web, que además monta el webhook de WhatsApp.
// Max atiende por la Cloud API oficial de Meta (vía 360dialog) cuando
// WA_PROVIDER=meta; el webhook se monta desde web.js.
//
// Baileys (el canal viejo con QR) se eliminó el 14 ago 2026: hacía más de tres
// semanas que estaba apagado y su copia de la lógica de avisos, ya desactualizada,
// fue la causa de que las transferencias dejaran de avisarse al equipo.
import "./web.js";
