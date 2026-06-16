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

// Productos SOLO-WEB: se venden en la tienda online pero NO están en Mercado Libre.
// Se suman siempre al catálogo (sobreviven la sincronización con ML).
// Las imágenes son URLs públicas de la web.
const EXTRA_PRODUCTOS = [
  {
    n: "Lona Marítima Enrollable Volkswagen Saveiro Doble Cabina",
    p: 11600,
    l: null,
    img: "https://lacasadelcubreasiento.vercel.app/img/lonas/lona_vw_saveiro_dc.png",
    usd: 0,
    u: "https://lacasadelcubreasiento.vercel.app/producto/web-lona-saveiro-dc",
  },
  {
    n: "Lona Marítima Enrollable Chevrolet Montana Doble Cabina",
    p: 11600,
    l: null,
    img: "https://lacasadelcubreasiento.vercel.app/img/lonas/lona_chevrolet_montana_dc.png",
    usd: 0,
    u: "https://lacasadelcubreasiento.vercel.app/producto/web-lona-montana-dc",
  },
  {
    n: "Kit Barras de Techo BYD Yuan Pro - Transversales + Longitudinales",
    p: 18450,
    l: null,
    img: "https://lacasadelcubreasiento.vercel.app/img/lonas/barras_byd_yuan_pro.png",
    usd: 0,
    u: "https://lacasadelcubreasiento.vercel.app/producto/web-barras-byd-yuan-pro",
  },
];

export function productos() {
  return [...(datos.productos || []), ...EXTRA_PRODUCTOS];
}

export function infoCatalogo() {
  return { cantidad: (datos.productos || []).length, actualizado: datos.actualizado || "?", fuente: datos.fuente || "snapshot" };
}

// Reemplaza el catálogo completo (lo llama la sincronización con la API de ML).
// Persiste a disco como caché (en Render el disco es efímero: al reiniciar
// se vuelve a sincronizar desde la API, así que no importa).
export function actualizarCatalogo(nuevosProductos, fuente = "api-ml") {
  datos = {
    ...datos,
    productos: nuevosProductos,
    actualizado: new Date().toISOString().slice(0, 19).replace("T", " "),
    fuente,
  };
  try {
    writeFileSync(RUTA, JSON.stringify(datos));
  } catch (e) {
    console.error("⚠ No pude persistir el catálogo (sigue en memoria):", e.message);
  }
}
