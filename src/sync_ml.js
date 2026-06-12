// Sincronización AUTOMÁTICA del catálogo con la API oficial de Mercado Libre.
// Mantiene a Max al día con precios, stock, altas y bajas de publicaciones.
//
// Usa el grant "client_credentials" (token de aplicación, sin OAuth de usuario).
// Método principal (soportado hoy): /users/{seller}/items/search -> IDs de las
// publicaciones ACTIVAS del vendedor, y luego el multiget /items?ids=... para
// traer título, precio, foto y stock. Como respaldo, intenta la vieja búsqueda
// pública /sites/MLU/search?seller_id (que ML restringió y suele dar 403).
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

// Resultado de la última sincronización (para diagnosticar en vivo vía /api/estado).
let _ultima = { ok: null, motivo: "todavía no corrió", cuando: null, cantidad: 0 };
export function ultimaSync() {
  return _ultima;
}
function ahora() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
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

// Mapea un item de ML al formato del catálogo {n, p, l, img, usd?, u?}.
function mapItem(it) {
  const precio = Math.round(Number(it.price) || 0);
  if (!precio || !it.title) return null;
  const lista = it.original_price ? Math.round(Number(it.original_price)) : null;
  const img = String(it.thumbnail || "").replace(/^http:/, "https:");
  const out = { n: it.title, p: precio, l: lista && lista > precio ? lista : null, img };
  if (it.currency_id === "USD") out.usd = 1;
  if (it.permalink) out.u = String(it.permalink).replace(/^http:/, "https:"); // link a la publicación de ML
  return out;
}

// Quita repetidos por título (algunas publicaciones se duplican).
function dedup(items) {
  const out = [];
  const vistos = new Set();
  for (const m of items) {
    const clave = (m.n || "").toLowerCase().trim();
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(m);
  }
  return out;
}

// ── Método principal: IDs de las publicaciones activas del vendedor ──
async function idsActivos(tk) {
  const ids = [];
  let total = Infinity;
  for (let offset = 0; offset < Math.min(total, 1000); offset += 100) {
    const url = `${API}/users/${SELLER_ML_ID}/items/search?status=active&limit=100&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`items/search ${res.status}: ${body.message || body.error || ""}`);
    total = body.paging?.total ?? 0;
    const batch = body.results || [];
    ids.push(...batch);
    if (batch.length < 100) break;
  }
  return ids;
}

// ── Detalle (título, precio, foto, stock) de cada publicación, de a 20 (multiget) ──
async function detallesDe(tk, ids) {
  const out = [];
  const ATTRS = "id,title,price,original_price,currency_id,thumbnail,available_quantity,status,permalink";
  for (let i = 0; i < ids.length; i += 20) {
    const grupo = ids.slice(i, i + 20);
    const url = `${API}/items?ids=${grupo.join(",")}&attributes=${ATTRS}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    const body = await res.json().catch(() => []);
    if (!Array.isArray(body)) continue;
    for (const wrap of body) {
      const it = wrap?.body;
      if (!it || (wrap.code && wrap.code !== 200)) continue;
      if (it.status && it.status !== "active") continue;
      if (typeof it.available_quantity === "number" && it.available_quantity <= 0) continue;
      const m = mapItem(it);
      if (m) out.push(m);
    }
  }
  return out;
}

// ── Respaldo: vieja búsqueda pública por seller_id (ML la restringió, suele dar 403) ──
async function viaSitesSearch(tk) {
  const items = [];
  let total = Infinity;
  for (let offset = 0; offset < Math.min(total, 1000); offset += 50) {
    const res = await fetch(`${API}/sites/${SITE}/search?seller_id=${SELLER_ML_ID}&limit=50&offset=${offset}`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status}: ${body.message || ""}`);
    total = body.paging?.total ?? 0;
    for (const it of body.results || []) {
      const m = mapItem(it);
      if (m) items.push(m);
    }
    if (!body.results || body.results.length < 50) break;
  }
  return items;
}

// Descarga las publicaciones activas del vendedor y reemplaza el catálogo.
export async function sincronizar() {
  if (!haySyncML()) {
    _ultima = { ok: false, motivo: "Sin credenciales ML (ML_CLIENT_ID / ML_CLIENT_SECRET)", cuando: ahora(), cantidad: 0 };
    return _ultima;
  }
  try {
    const tk = await tokenApp();
    let items = [];
    let via = "";
    // 1) Método recomendado: items del propio vendedor + multiget de detalles.
    try {
      const ids = await idsActivos(tk);
      items = dedup(await detallesDe(tk, ids));
      via = "users/items";
    } catch (e1) {
      // 2) Respaldo: búsqueda pública por seller_id (por si vuelve a habilitarse).
      try {
        items = dedup(await viaSitesSearch(tk));
        via = "sites/search";
      } catch (e2) {
        throw new Error(`items/search -> ${e1.message} || sites/search -> ${e2.message}`);
      }
    }
    // Cinturón de seguridad: si la API devolvió poquísimo, NO pisamos el catálogo
    // (puede ser un fallo transitorio); mejor seguir con lo que hay.
    if (items.length < 30) {
      _ultima = { ok: false, motivo: `solo ${items.length} items (via ${via}); no piso el catálogo`, cuando: ahora(), cantidad: items.length };
      return _ultima;
    }
    actualizarCatalogo(items, "api-ml");
    console.log(`🔄 Catálogo sincronizado con Mercado Libre: ${items.length} publicaciones activas (${via}).`);
    _ultima = { ok: true, motivo: `ok (${via})`, cuando: ahora(), cantidad: items.length };
    return _ultima;
  } catch (e) {
    console.error("⚠ Sync ML falló:", e.message);
    _ultima = { ok: false, motivo: String(e.message || e).slice(0, 400), cuando: ahora(), cantidad: 0 };
    return _ultima;
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
