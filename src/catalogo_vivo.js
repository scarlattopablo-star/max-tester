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

export function productos() {
  return datos.productos || [];
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
