// Ventas hechas DENTRO de Mercado Libre (órdenes de la cuenta EVERBOX), para
// el reporte diario de la web. Solo lectura, pero la API de órdenes exige el
// token de USUARIO (ml_user.js): sin autorización devolvemos autorizado:false
// y la web lo informa como pendiente (no es un error).
import "./env.js";
import { tokenUsuario } from "./ml_user.js";
import { SELLER_ML_ID } from "./config.js";

const API = "https://api.mercadolibre.com";
const PAGINA = 50; // límite por página de orders/search
const MAX_ORDENES = 200; // tope sano: un día normal del local entra de sobra

/**
 * Órdenes PAGAS de ML creadas entre desdeISO y hastaISO (fechas ISO 8601).
 * Devuelve { autorizado, ordenes: [{id, fecha, total, titulo}], total }.
 * Lanza en fallas de la API (red/ML caído) para que el endpoint responda 503.
 */
export async function ordenesML(desdeISO, hastaISO) {
  const tk = await tokenUsuario();
  if (!tk) return { autorizado: false, ordenes: [] };

  const ordenes = [];
  for (let offset = 0; offset < MAX_ORDENES; offset += PAGINA) {
    const url = new URL(`${API}/orders/search`);
    url.searchParams.set("seller", SELLER_ML_ID);
    url.searchParams.set("order.date_created.from", String(desdeISO || ""));
    url.searchParams.set("order.date_created.to", String(hastaISO || ""));
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("limit", String(PAGINA));
    url.searchParams.set("offset", String(offset));

    const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`orders/search ML: ${body.message || body.error || r.status}`);

    const resultados = Array.isArray(body.results) ? body.results : [];
    for (const o of resultados) {
      if (o.status !== "paid") continue; // solo órdenes efectivamente pagas
      ordenes.push({
        id: o.id,
        fecha: o.date_created,
        total: Number(o.total_amount) || 0,
        titulo: o.order_items?.[0]?.item?.title || "?",
      });
    }
    if (resultados.length < PAGINA) break; // última página
  }

  const total = ordenes.reduce((suma, o) => suma + o.total, 0);
  return { autorizado: true, ordenes, total };
}
