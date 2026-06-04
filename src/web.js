// Servidor web: una pantalla de chat (igual al tester) para probar a Max desde
// un LINK, en compu o celular. Reusa el mismo cerebro que WhatsApp.
//   npm run web   -> abre http://localhost:3000
import "./env.js";
import express from "express";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { procesarMensaje } from "./handler.js";
import { reiniciar, historial } from "./memoria.js";
import { sleep, delayEscritura } from "./humano.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: "20mb" })); // permite fotos en base64
// CORS (para el ingest temporal de datos desde el navegador de ML)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.static(PUBLIC));

// Endpoint temporal: recibe el catálogo scrapeado y lo guarda como productos_ml.json.
app.post("/api/_ingest", (req, res) => {
  const productos = req.body?.productos;
  if (!Array.isArray(productos) || !productos.length) return res.status(400).json({ error: "no productos" });
  const out = {
    _nota: "TODOS los productos en venta de Mercado Libre (snapshot 2026-06-04). n=nombre, p=precio venta, l=precio lista, img=URL foto principal.",
    moneda: "UYU",
    fuente: "Mercado Libre - Mis publicaciones",
    actualizado: "2026-06-04",
    productos,
  };
  writeFileSync(join(__dirname, "productos_ml.json"), JSON.stringify(out), "utf8");
  res.json({ ok: true, n: productos.length });
});

app.get("/", (_req, res) => res.sendFile(join(PUBLIC, "chat.html")));

app.post("/api/chat", async (req, res) => {
  const { chatId, texto, imagen } = req.body || {};
  const imagenes = imagen ? [imagen] : [];
  if (!chatId || (!texto && !imagenes.length)) return res.status(400).json({ error: "faltan datos" });
  try {
    const { texto: respuesta } = await procesarMensaje({ chatId: String(chatId), texto: String(texto || ""), canal: "web", imagenes });
    // Pausa humana (que se tome su tiempo, como en el tester).
    await sleep(delayEscritura(respuesta));
    res.json({ texto: respuesta });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("FALTA_API_KEY")) return res.json({ texto: "⚠ Falta cargar la clave de IA en el servidor (.env)." });
    if (e?.status === 429 || /rate.?limit/i.test(msg)) return res.json({ texto: "⏳ Se llegó al límite de la IA por ahora. Probá en un ratito." });
    console.error("Error /api/chat:", msg);
    res.json({ texto: "Disculpá, tuve un problemita técnico. ¿Me lo repetís? 🙏" });
  }
});

app.get("/api/history", (req, res) => {
  const chatId = req.query.chatId;
  if (!chatId) return res.json({ mensajes: [] });
  res.json({ mensajes: historial(String(chatId)) });
});

app.post("/api/reset", (req, res) => {
  const { chatId } = req.body || {};
  if (chatId) reiniciar(String(chatId));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n🌐 Max está online en: http://localhost:${PORT}`);
  console.log("   Abrí ese link en el navegador para probarlo.");
  console.log("   Para compartirlo por un LINK público (celular/otra persona), ver README (sección Link público).\n");
});
