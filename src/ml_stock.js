// Baja el stock en Mercado Libre cuando se vende por FUERA de ML (web o link
// de pago de Max). Así ML queda como única fuente de verdad del inventario:
// ML ⇄ Max ⇄ web, ida y vuelta.
//
// Necesita la cuenta EVERBOX autorizada (ml_user.js). Idempotente por `ref`
// (id de pedido web o external_reference del link de Max): los reintentos del
// webhook de MP no descuentan dos veces.
import "./env.js";
import { neon } from "@neondatabase/serverless";
import { tokenUsuario } from "./ml_user.js";
import { productos } from "./catalogo_vivo.js";
import { sincronizar } from "./sync_ml.js";

const API = "https://api.mercadolibre.com";
// Conexión perezosa (igual que ml_user.js): el módulo carga sin DATABASE_URL.
let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

async function prepararTablas() {
  await sql`create table if not exists ml_stock_mov (
    ref text primary key,
    detalle jsonb,
    created_at timestamptz default now()
  )`;
  await sql`create table if not exists max_links (
    ref text primary key,
    items jsonb,
    chat_id text,
    contacto jsonb,
    created_at timestamptz default now()
  )`;
  // Columnas agregadas después (para tablas viejas que no las tenían). No rompe si ya existen.
  await sql`alter table max_links add column if not exists chat_id text`;
  await sql`alter table max_links add column if not exists contacto jsonb`;
}

/**
 * Guarda a qué CONVERSACIÓN y producto(s) corresponde un link de pago de Max
 * (ref = external_reference). Se guarda SIEMPRE que haya ref, aunque no se haya
 * identificado el producto del catálogo: así, cuando el pago se acredite, el aviso
 * al equipo puede incluir el LINK A LA CONVERSACIÓN y los DATOS del cliente, y los
 * asesores pueden entrar al chat y ver quién compró.
 * datos: { items?: [{id, qty}], chatId?: string, contacto?: {nombre, tel} }
 */
export async function guardarLinkMax(ref, datos = {}) {
  if (!ref) return;
  // Compatibilidad: si llega un array directo, son los items (firma vieja).
  const { items, chatId, contacto } = Array.isArray(datos) ? { items: datos } : datos;
  await prepararTablas();
  const itemsJson = Array.isArray(items) && items.length ? JSON.stringify(items) : null;
  const contactoJson = contacto && (contacto.nombre || contacto.tel) ? JSON.stringify(contacto) : null;
  await sql`insert into max_links (ref, items, chat_id, contacto)
    values (${ref}, ${itemsJson}::jsonb, ${chatId || null}, ${contactoJson}::jsonb)
    on conflict (ref) do nothing`;
}

/** Recupera la conversación y el cliente asociados a un link de pago de Max. */
export async function datosLinkMax(ref) {
  if (!ref) return null;
  try {
    await prepararTablas();
    const rows = await sql`select items, chat_id, contacto from max_links where ref = ${ref}`;
    if (!rows.length) return null;
    return { items: rows[0].items || [], chatId: rows[0].chat_id || "", contacto: rows[0].contacto || {} };
  } catch (e) {
    console.error("⚠ No pude leer el link de Max:", e.message);
    return null;
  }
}

/** Busca en el catálogo vivo un producto por su NOMBRE EXACTO y devuelve el id de ML (del permalink). */
export function resolverPorNombre(nombre) {
  if (!nombre) return null;
  const limpio = String(nombre).toLowerCase().replace(/\s+/g, " ").trim();
  const p = productos().find((x) => String(x.n || "").toLowerCase().replace(/\s+/g, " ").trim() === limpio);
  const m = p && p.u ? String(p.u).match(/MLU-?(\d+)/) : null;
  return m ? m[1] : null;
}

const aIdML = (id) => {
  const d = String(id || "").replace(/\D/g, "");
  return d ? `MLU${d}` : null;
};

async function bajarStockItem(tk, idML, qty, varId) {
  const r = await fetch(`${API}/items/${idML}?attributes=id,available_quantity,variations,status`, {
    headers: { Authorization: `Bearer ${tk}` },
  });
  const item = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GET item: ${item.message || r.status}`);

  // Publicación con variaciones (colores/talles): el stock vive en cada variación.
  // Si la venta trae la variación elegida (varId), se baja ESA; si no, la de más stock.
  if (Array.isArray(item.variations) && item.variations.length) {
    const elegida = varId ? item.variations.find((x) => String(x.id) === String(varId)) : null;
    const v = elegida || [...item.variations].sort((a, b) => (b.available_quantity || 0) - (a.available_quantity || 0))[0];
    const nuevo = Math.max(0, (v.available_quantity || 0) - qty);
    const put = await fetch(`${API}/items/${idML}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ variations: [{ id: v.id, available_quantity: nuevo }] }),
    });
    const pb = await put.json().catch(() => ({}));
    if (!put.ok) throw new Error(`PUT variación: ${pb.message || put.status}`);
    return { variacion: v.id, antes: v.available_quantity, despues: nuevo };
  }

  const nuevo = Math.max(0, (item.available_quantity || 0) - qty);
  const put = await fetch(`${API}/items/${idML}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
    body: JSON.stringify({ available_quantity: nuevo }),
  });
  const pb = await put.json().catch(() => ({}));
  if (!put.ok) throw new Error(`PUT item: ${pb.message || put.status}`);
  return { antes: item.available_quantity, despues: nuevo };
}

/**
 * Descuenta en ML el stock de una venta hecha por fuera de ML.
 * ref: id único de la venta (pedido web o external_reference "max-...").
 * items: [{id, qty}] — si viene vacío y la ref es de Max, se busca en max_links.
 * Lanza error en fallas transitorias (sin autorización / red / todo falló) para
 * que el que llama reintente; los reintentos son seguros (idempotente por ref).
 */
export async function descontarVenta(ref, items) {
  if (!ref) throw new Error("falta ref de la venta");
  await prepararTablas();

  const previo = await sql`select ref from ml_stock_mov where ref = ${ref}`;
  if (previo.length) return { ok: true, repetido: true };

  let lista = Array.isArray(items) && items.length ? items : null;
  if (!lista) {
    const rows = await sql`select items from max_links where ref = ${ref}`;
    lista = rows[0]?.items || [];
  }
  if (!lista.length) {
    // Venta sin producto identificado (ej: link de Max sin mapeo): se registra
    // y no se toca ML; el aviso de WhatsApp ya le llega al humano igual.
    await sql`insert into ml_stock_mov (ref, detalle) values (${ref}, ${JSON.stringify({ sinItems: true })}::jsonb)
      on conflict (ref) do nothing`;
    return { ok: true, sinItems: true };
  }

  const tk = await tokenUsuario();
  if (!tk) {
    const e = new Error("Cuenta de ML sin autorizar: entrar a /api/ml/conectar (logueado como EVERBOX)");
    e.sinAuth = true;
    throw e;
  }

  const resultados = [];
  for (const it of lista) {
    const idML = aIdML(it.id);
    const qty = Math.max(1, Math.round(Number(it.qty) || 1));
    if (!idML) {
      resultados.push({ id: it.id, ok: false, motivo: "id inválido" });
      continue;
    }
    try {
      const r = await bajarStockItem(tk, idML, qty, it.varId);
      resultados.push({ id: idML, qty, ok: true, ...r });
      console.log(`📉 Stock ML ${idML}: ${r.antes} → ${r.despues} (venta ${ref})`);
    } catch (e) {
      resultados.push({ id: idML, qty, ok: false, motivo: String(e.message || e).slice(0, 200) });
      console.error(`⚠ No pude bajar stock de ${idML} (venta ${ref}):`, e.message);
    }
  }

  // Si NO se pudo descontar ninguno, no registramos la ref: el reintento del
  // webhook vuelve a probar. Si al menos uno salió, registramos (los fallidos
  // quedan en el detalle para revisarlos a mano).
  const algunoOk = resultados.some((x) => x.ok);
  if (!algunoOk) throw new Error(`no se pudo descontar stock: ${resultados.map((x) => x.motivo).join(" | ")}`);

  await sql`insert into ml_stock_mov (ref, detalle) values (${ref}, ${JSON.stringify({ resultados })}::jsonb)
    on conflict (ref) do nothing`;

  // Refresca el catálogo ya mismo para que Max y la web vean el stock nuevo.
  sincronizar().catch(() => {});

  return { ok: true, resultados };
}
