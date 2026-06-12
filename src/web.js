// Servidor web: una pantalla de chat (igual al tester) para probar a Max desde
// un LINK, en compu o celular. Reusa el mismo cerebro que WhatsApp.
//   npm run web   -> abre http://localhost:3000
import "./env.js";
import express from "express";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { procesarMensaje } from "./handler.js";
import { saludoInicial } from "./cerebro.js";
import { reiniciar, historial, agregar } from "./memoria.js";
import { sleep, delayEscritura } from "./humano.js";
import { programarSync, haySyncML, ultimaSync, sincronizar } from "./sync_ml.js";
import { infoCatalogo } from "./catalogo_vivo.js";
import { hayMercadoPago } from "./pagos.js";
import { proveedorIA } from "./config.js";
import { enviarAviso, hayWhatsApp } from "./notificador.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: "15mb" })); // permite fotos en base64
app.use(express.static(PUBLIC));

app.get("/", (_req, res) => res.sendFile(join(PUBLIC, "chat.html")));

app.post("/api/chat", async (req, res) => {
  const { chatId, texto, imagen } = req.body || {};
  const imagenes = imagen ? [imagen] : [];
  if (!chatId || (!texto && !imagenes.length)) return res.status(400).json({ error: "faltan datos" });
  try {
    const { texto: respuesta, imagenesEnviar = [] } = await procesarMensaje({ chatId: String(chatId), texto: String(texto || ""), canal: "web", imagenes });
    // Pausa humana (que se tome su tiempo, como en el tester).
    await sleep(delayEscritura(respuesta));
    res.json({ texto: respuesta, fotos: imagenesEnviar });
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
  // Recortamos el contexto interno (después del separador invisible ⁣) que guardamos
  // para el modelo: el cliente solo ve la parte visible del mensaje.
  const mensajes = historial(String(chatId)).map((m) => ({ ...m, content: String(m.content || "").split("⁣")[0] }));
  res.json({ mensajes });
});

// Saludo inicial: genera UNA presentación variada, la guarda en memoria y la devuelve.
// Así Max no se vuelve a presentar cuando el cliente responde.
app.get("/api/greeting", (req, res) => {
  const chatId = req.query.chatId ? String(req.query.chatId) : "";
  const previo = chatId ? historial(chatId) : [];
  if (previo.length) return res.json({ texto: null, yaSaludo: true }); // ya hay charla, no saludar de nuevo
  const texto = saludoInicial();
  if (chatId) agregar(chatId, "assistant", texto);
  res.json({ texto });
});

app.post("/api/reset", (req, res) => {
  const { chatId } = req.body || {};
  if (chatId) reiniciar(String(chatId));
  res.json({ ok: true });
});

// Estado rápido del bot (catálogo, sync ML, Mercado Pago, cerebro IA) para chequear la config en vivo.
app.get("/api/estado", (_req, res) => {
  const ia = proveedorIA();
  res.json({ catalogo: infoCatalogo(), syncML: haySyncML(), ultimaSync: ultimaSync(), mercadoPago: hayMercadoPago(), ia: { proveedor: ia.nombre, modelo: ia.model } });
});

// Fuerza una sincronización con Mercado Libre AHORA y devuelve el resultado
// (para verificar la config sin esperar al ciclo de 6 h ni revisar logs).
app.get("/api/sync-ahora", async (_req, res) => {
  const r = await sincronizar();
  res.json({ resultado: r, catalogo: infoCatalogo() });
});

// Aviso de venta de la web (Vercel). Autenticado por token compartido.
app.post("/api/notificar-venta", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = process.env.NOTIFY_TOKEN;
  if (!token || auth !== `Bearer ${token}`) return res.status(401).json({ error: "no autorizado" });
  if (!hayWhatsApp()) return res.status(503).json({ ok: false, whatsapp: false });
  try {
    await enviarAviso(req.body || {});
    res.json({ ok: true });
  } catch (e) {
    console.error("Aviso de venta falló:", e.message);
    res.status(503).json({ ok: false, whatsapp: e.whatsapp !== false });
  }
});

app.listen(PORT, () => {
  console.log(`\n🌐 Max está online en: http://localhost:${PORT}`);
  console.log("   Abrí ese link en el navegador para probarlo.");
  console.log("   Para compartirlo por un LINK público (celular/otra persona), ver README (sección Link público).\n");
  // Sincronización automática del catálogo con la API de Mercado Libre (cada 6 h).
  programarSync(6);
});
