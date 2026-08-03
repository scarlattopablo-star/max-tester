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

// Mapea un item de ML al formato del catálogo {n, p, l, img, imgs?, usd?, u?, v?}.
// precio = { venta, lista } resuelto desde /prices (incluye promociones activas).
// Si no se pudo obtener, cae al price/original_price del item (puede NO traer la promo).
function mapItem(it, precio) {
  const venta = precio ? precio.venta : Math.round(Number(it.price) || 0);
  const lista = precio ? precio.lista : (it.original_price ? Math.round(Number(it.original_price)) : null);
  if (!venta || !it.title) return null;
  const img = String(it.thumbnail || "").replace(/^http:/, "https:");
  // El `id` de la publicación es lo que ata una ESPERA ("avisame cuando llegue")
  // a un producto concreto: sin él no se puede saber que volvió el mismo artículo.
  const out = { id: String(it.id || ""), n: it.title, p: venta, l: lista && lista > venta ? lista : null, img };
  // Todas las fotos de la publicación (la web arma una galería con estas).
  if (Array.isArray(it.pictures) && it.pictures.length) {
    out.imgs = it.pictures
      .map((p) => String(p.secure_url || p.url || "").replace(/^http:/, "https:"))
      .filter(Boolean);
  }
  if (it.currency_id === "USD") out.usd = 1;
  if (it.permalink) out.u = String(it.permalink).replace(/^http:/, "https:"); // link a la publicación de ML
  // Variaciones (colores): la web muestra selector y el stock se baja por variación.
  if (Array.isArray(it.variations) && it.variations.length) {
    out.v = it.variations.map((x) => {
      const c = (x.attribute_combinations || []).find((a) => a.id === "COLOR" || a.name === "Color");
      return { id: String(x.id), c: c?.value_name || "Único", s: Number(x.available_quantity) || 0 };
    });
  }
  return out;
}

// Precio REAL que ve el comprador en ML (incluye PROMOCIONES activas, que NO
// siempre vienen en item.price). Se consulta /items/{id}/prices: la venta es la
// "promotion" vigente si existe, sino el "standard"; el tachado es el de lista
// cuando hay promo. Devuelve { venta, lista|null } o null si no se pudo.
async function precioReal(tk, id) {
  try {
    const res = await fetch(`${API}/items/${id}/prices`, { headers: { Authorization: `Bearer ${tk}` } });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    const std = (body.prices || []).find((p) => p.type === "standard");
    const now = Date.now();
    const promo = (body.prices || []).find(
      (p) =>
        p.type === "promotion" &&
        (!p.conditions?.start_time || Date.parse(p.conditions.start_time) <= now) &&
        (!p.conditions?.end_time || Date.parse(p.conditions.end_time) >= now)
    );
    const base = std ? Math.round(Number(std.amount) || 0) : 0;
    if (promo) {
      const venta = Math.round(Number(promo.amount) || 0);
      const tachado = Math.round(Number(promo.regular_amount) || base || 0);
      if (venta) return { venta, lista: tachado > venta ? tachado : null };
    }
    if (base) return { venta: base, lista: null };
    return null;
  } catch {
    return null;
  }
}

// Resuelve los precios reales de muchos items con concurrencia limitada
// (rápido sin saturar la API de ML).
async function preciosReales(tk, ids) {
  const mapa = new Map();
  const CONC = 8;
  for (let i = 0; i < ids.length; i += CONC) {
    const grupo = ids.slice(i, i + CONC);
    const res = await Promise.all(grupo.map((id) => precioReal(tk, id)));
    grupo.forEach((id, j) => { if (res[j]) mapa.set(id, res[j]); });
  }
  return mapa;
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

// ── Método principal: IDs de las publicaciones del vendedor, por estado ──
// `estado` = "active" (las que se venden) o "paused" (las caídas: agotadas o
// pausadas a mano, que son las que un cliente puede pedir que le avisemos).
async function idsPorEstado(tk, estado = "active") {
  const ids = [];
  let total = Infinity;
  for (let offset = 0; offset < Math.min(total, 1000); offset += 100) {
    const url = `${API}/users/${SELLER_ML_ID}/items/search?status=${estado}&limit=100&offset=${offset}`;
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

// ── Detalle (título, fotos, stock) de cada publicación, de a 20 (multiget) ──
// Devuelve DOS listas:
//   activos  → se pueden vender hoy (status active y stock > 0). Es el catálogo.
//   agotados → existen pero no se pueden comprar (pausadas, o activas en cero).
// Antes las caídas se tiraban a la basura, y por eso Max no podía distinguir
// "se agotó" de "no trabajamos ese modelo".
async function detallesDe(tk, ids) {
  const vendibles = [];
  const caidos = [];
  const ATTRS = "id,title,price,original_price,currency_id,thumbnail,pictures,available_quantity,status,permalink,variations";
  for (let i = 0; i < ids.length; i += 20) {
    const grupo = ids.slice(i, i + 20);
    const url = `${API}/items?ids=${grupo.join(",")}&attributes=${ATTRS}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    const body = await res.json().catch(() => []);
    if (!Array.isArray(body)) continue;
    for (const wrap of body) {
      const it = wrap?.body;
      if (!it || (wrap.code && wrap.code !== 200)) continue;
      // "closed" = publicación terminada para siempre: no vuelve, no interesa.
      if (it.status && it.status !== "active" && it.status !== "paused") continue;
      const sinStock = typeof it.available_quantity === "number" && it.available_quantity <= 0;
      if (it.status === "paused" || sinStock) caidos.push(it);
      else vendibles.push(it);
    }
  }
  // Precio REAL (con promociones activas) vía /prices: SOLO de los vendibles.
  // De un producto agotado alcanza con el título (es lo único que sale en el aviso),
  // así el sync no duplica las llamadas a la API de ML.
  const precios = await preciosReales(tk, vendibles.map((r) => r.id));
  const activos = [];
  for (const it of vendibles) {
    const m = mapItem(it, precios.get(it.id));
    if (m) activos.push(m);
  }
  // Para los agotados NO exigimos precio (mapItem descarta lo que no lo tenga, y una
  // publicación pausada bien puede venir en cero): alcanza con id + título, que es
  // lo único que necesita el aviso "volvió a estar disponible".
  const agotados = caidos
    .filter((it) => it.id && it.title)
    .map((it) => ({
      id: String(it.id),
      n: it.title,
      img: String(it.thumbnail || "").replace(/^http:/, "https:"),
      motivo: it.status === "paused" ? "pausada" : "sin stock",
    }));
  return { activos, agotados };
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
    let caidos = null; // null = esta vía no sabe de agotados; no pisamos los que había
    let via = "";
    // 1) Método recomendado: items del propio vendedor + multiget de detalles.
    //    Pedimos los ACTIVOS y también los PAUSADOS: de estos últimos sale la lista
    //    de agotados que Max usa para ofrecer "te aviso cuando llegue".
    try {
      const [idsAct, idsPau] = await Promise.all([
        idsPorEstado(tk, "active"),
        // Que falle el listado de pausados NO puede voltear el sync entero: en el
        // peor caso nos quedamos sin agotados nuevos, pero el catálogo se actualiza.
        idsPorEstado(tk, "paused").catch((e) => {
          console.error("⚠ No pude listar las publicaciones pausadas:", e.message);
          return [];
        }),
      ]);
      const det = await detallesDe(tk, [...idsAct, ...idsPau]);
      items = dedup(det.activos);
      caidos = det.agotados;
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
    actualizarCatalogo(items, "api-ml", caidos);
    console.log(`🔄 Catálogo sincronizado con Mercado Libre: ${items.length} publicaciones activas${caidos ? ` y ${caidos.length} agotadas` : ""} (${via}).`);
    _ultima = { ok: true, motivo: `ok (${via})`, cuando: ahora(), cantidad: items.length, agotados: caidos ? caidos.length : null };
    // Con el catálogo fresco, avisamos a los clientes cuyo producto volvió.
    // Nunca puede voltear la sincronización: si falla, se reintenta en la próxima.
    try {
      const { revisarReposiciones } = await import("./esperas.js");
      await revisarReposiciones();
    } catch (e) {
      console.error("⚠ Repaso de esperas falló:", e.message);
    }
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
