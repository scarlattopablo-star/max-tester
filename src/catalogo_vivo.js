// Catálogo VIVO: los productos de Mercado Libre en memoria.
// Arranca con el snapshot productos_ml.json y se actualiza solo con sync_ml.js
// (API oficial de ML) sin reiniciar el bot. Un solo lugar de lectura para el cerebro.
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUTA = join(__dirname, "productos_ml.json");

let datos = { moneda: "UYU", productos: [] };
try {
  datos = JSON.parse(readFileSync(RUTA, "utf8"));
} catch (e) {
  console.error("⚠ No pude leer productos_ml.json:", e.message);
}

// ARRANQUE: hasta que termina la PRIMERA sincronización con ML, lo que hay en memoria
// es el snapshot del repo (productos_ml.json), que puede tener meses. Pasó el 8 oct
// 2026: después de cada deploy, durante unos minutos, Max ofrecía publicaciones que
// hoy están PAUSADAS (el combo piso + baúl del HB20 a $5.900) y precios viejos
// ($2.672 en vez de $2.625). Las herramientas del catálogo esperan esa primera sync
// (ver esperarCatalogoFresco en cerebro.js). Si no hay sync programada —pruebas,
// simulador, sin credenciales— no se espera nada.
let _syncPendiente = false;
let _avisarFresco = () => {};
let _fresco = new Promise((r) => { _avisarFresco = r; });
export function iniciarEsperaSync() {
  _syncPendiente = true;
  _fresco = new Promise((r) => { _avisarFresco = r; });
}
export function marcarCatalogoFresco() {
  _syncPendiente = false;
  _avisarFresco();
}
export async function esperarCatalogoFresco(ms = 60000) {
  if (!_syncPendiente) return true;
  let t;
  const ok = await Promise.race([_fresco.then(() => true), new Promise((r) => { t = setTimeout(() => r(false), ms); })]);
  clearTimeout(t);
  return ok;
}

export function productos() {
  return datos.productos || [];
}

// Publicaciones que EXISTEN en Mercado Libre pero hoy NO se pueden comprar
// (pausadas, o activas con stock 0). NO son parte del catálogo de venta: Max nunca
// las ofrece ni las cotiza. Solo las usa para distinguir "se agotó" (existe y puede
// volver) de "no trabajamos ese modelo" (no existe la publicación).
export function agotados() {
  return datos.agotados || [];
}

// Busca una publicación agotada por su id de ML (lo usa el repaso de esperas).
export function agotadoPorId(id) {
  const clave = String(id || "");
  return (datos.agotados || []).find((p) => String(p.id) === clave) || null;
}

// ¿Esta publicación está HOY disponible para vender? (activa y con stock).
// Es lo que dispara el aviso "llegó" a los clientes que estaban esperando.
export function estaDisponible(id) {
  const clave = String(id || "");
  return (datos.productos || []).some((p) => String(p.id) === clave);
}

export function infoCatalogo() {
  return {
    cantidad: (datos.productos || []).length,
    agotados: (datos.agotados || []).length,
    // Publicaciones que se venden pero NO son de entrega inmediata (campo `d` =
    // días de disponibilidad, ver sync_ml.js). Sale en /api/estado para poder
    // comprobar de un vistazo que Mercado Libre está mandando ese plazo.
    aPedido: (datos.productos || []).filter((p) => Number(p.d) > 0).length,
    actualizado: datos.actualizado || "?",
    fuente: datos.fuente || "snapshot",
  };
}

// Reemplaza el catálogo completo (lo llama la sincronización con la API de ML).
// Persiste a disco como caché (en Render el disco es efímero: al reiniciar
// se vuelve a sincronizar desde la API, así que no importa).
// `nuevosAgotados` es opcional: si no viene, la lista de agotados queda como estaba
// (así una sincronización parcial no borra lo que ya sabíamos).
export function actualizarCatalogo(nuevosProductos, fuente = "api-ml", nuevosAgotados = null) {
  datos = {
    ...datos,
    productos: nuevosProductos,
    ...(nuevosAgotados ? { agotados: nuevosAgotados } : {}),
    actualizado: new Date().toISOString().slice(0, 19).replace("T", " "),
    fuente,
  };
  marcarCatalogoFresco();
  // CATALOGO_SIN_DISCO=1 → solo memoria. Lo usan las pruebas: sin esto, cargar un
  // catálogo de juguete PISA el snapshot real de productos_ml.json.
  if (process.env.CATALOGO_SIN_DISCO) return;
  try {
    writeFileSync(RUTA, JSON.stringify(datos));
  } catch (e) {
    console.error("⚠ No pude persistir el catálogo (sigue en memoria):", e.message);
  }
}
