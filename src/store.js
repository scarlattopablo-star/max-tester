// Helpers chiquitos para leer/escribir JSON en /data sin pisar errores.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, "..", "data");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export function leer(archivo, porDefecto) {
  const ruta = join(DATA_DIR, archivo);
  if (!existsSync(ruta)) return porDefecto;
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return porDefecto;
  }
}

export function guardar(archivo, datos) {
  writeFileSync(join(DATA_DIR, archivo), JSON.stringify(datos, null, 2), "utf8");
}
