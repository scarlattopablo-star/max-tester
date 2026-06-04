// Carga el .env y FUERZA que tenga prioridad sobre variables ya existentes en el
// entorno (ej: si la PC ya tiene una ANTHROPIC_API_KEY de otra app/Claude Code).
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env"), override: true });
