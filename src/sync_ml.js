// Sincronización AUTOMÁTICA del catálogo con la API oficial de Mercado Libre.
// Mantiene a Max al día con precios, stock, altas y bajas de publicaciones.
//
// Usa el grant "client_credentials" (token de aplicación, sin OAuth de usuario):
// alcanza para leer las publicaciones ACTIVAS del vendedor vía /sites/MLU/search.
//
// Credenciales necesarias (variables de entorno, .env local / Environment en Render):
//   ML_CLIENT_ID     -> App ID de la aplicación creada en developers.mercadolibre.com
//   ML_CLIENT_SECRET -> Secret key de esa aplicación
// Sin credenciales, la sincronización se salta (el bot sigue con el snapshot).
import "./env.js";
import { actualizarCatalogo, infoCatalogo } from "./catalogo_vivo.js";
import { SELLER_ML_ID } from "./config.js";

const API = "https://api.mercadolibre.com";
const SITE = "MLU"; // Uruguay

export function haySyncML() {
  return !!(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET);
}

// ── Token de aplicación (dura 6 h; lo cacheamos y renovamos solo) ──
let _token = null;
let _tokenVence = 0;
async function tokenApp() {
  if (_token && Date.now() < _tokenVence - 60_000) return _token;
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`token ML: ${body.message || body.error || res.status}`);
  _token = body.access_token;
  _tokenVence = Date.now() + (body.expires_in || 21600) * 1000;
  return _token;
}

// Mapea un resultado de búsqueda de ML al formato del catálogo {n, p, l, img, usd?}.
function mapItem(it) {
  const precio = Math.round(Number(it.price) || 0);
  if (!precio || !it.title) return null;
  const lista = it.original_price ? Math.round(Number(it.original_price)) : null;
  const img = String(it.thumbnail || "").replace(/^http:/, "https:");
  const out = { n: it.title, p: precio, l: lista && lista > precio ? lista : null, img };
  if (it.currency_id === "USD") out.usd = 1;
  return out;
}

// Descarga TODAS las publicaciones activas del vendedor y reemplaza el catálogo.
export async function sincronizar() {
  if (!haySyncML()) return { ok: false, motivo: "Sin credenciales ML (ML_CLIENT_ID / ML_CLIENT_SECRET)" };
  try {
    const tk = await tokenApp();
    const items = [];
    const vistos = new Set();
    let total = Infinity;
    for (let offset = 0; offset < Math.min(total, 1000); offset += 50) {
      const res = await fetch(`${API}/sites/${SITE}/search?seller_id=${SELLER_ML_ID}&limit=50&offset=${offset}`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`search ML: ${body.message || res.status}`);
      total = body.paging?.total ?? 0;
      for (const it of body.results || []) {
        const m = mapItem(it);
        if (!m) continue;
        const clave = m.n.toLowerCase().trim();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        items.push(m);
      }
      if (!body.results || body.results.length < 50) break;
    }
    // Cinturón de seguridad: si la API devolvió poquísimo, NO pisamos el catálogo
    // (puede ser un fallo transitorio); mejor seguir con lo que hay.
    if (items.length < 30) return { ok: false, motivo: `solo ${items.length} items; no piso el catálogo` };
    actualizarCatalogo(items, "api-ml");
    console.log(`🔄 Catálogo sincronizado con Mercado Libre: ${items.length} publicaciones activas.`);
    return { ok: true, cantidad: items.length };
  } catch (e) {
    console.error("⚠ Sync ML falló:", e.message);
    return { ok: false, motivo: String(e.message || e) };
  }
}

// Programa la sincronización periódica (cada `horas`). La corre ya al arrancar.
export function programarSync(horas = 6) {
  if (!haySyncML()) {
    console.log("ℹ Sync ML desactivado (faltan ML_CLIENT_ID / ML_CLIENT_SECRET). Catálogo:", JSON.stringify(infoCatalogo()));
    return;
  }
  sincronizar();
  setInterval(sincronizar, horas * 3600 * 1000);
  console.log(`⏰ Sync con Mercado Libre programado cada ${horas} h.`);
}
