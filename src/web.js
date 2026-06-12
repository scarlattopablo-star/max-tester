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
import { infoCatalogo, productos } from "./catalogo_vivo.js";
import { hayMercadoPago } from "./pagos.js";
import { proveedorIA } from "./config.js";
import { enviarAviso, hayWhatsApp } from "./notificador.js";
import { urlAutorizacion, conectarConCode, hayUsuarioML } from "./ml_user.js";
import { descontarVenta } from "./ml_stock.js";
import { ordenesML } from "./ml_ordenes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: "15mb" })); // permite fotos en base64
app.use(express.static(PUBLIC));

app.get("/", (req, res) => {
  // Retorno de la autorización de Mercado Libre (la callback de la app apunta
  // a la raíz): viene ?code= → lo canjeamos por el token de usuario.
  if (req.query.code) return res.redirect(`/api/ml/conectado?code=${encodeURIComponent(String(req.query.code))}`);
  res.sendFile(join(PUBLIC, "chat.html"));
});

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
app.get("/api/estado", async (_req, res) => {
  const ia = proveedorIA();
  res.json({ catalogo: infoCatalogo(), syncML: haySyncML(), ultimaSync: ultimaSync(), mlUsuario: await hayUsuarioML(), mercadoPago: hayMercadoPago(), ia: { proveedor: ia.nombre, modelo: ia.model } });
});

// ── Autorización de la cuenta de ML (un clic de Pablo, logueado como EVERBOX) ──
// Habilita ESCRIBIR en ML: bajar stock cuando se vende en la web o por Max.
app.get("/api/ml/conectar", (_req, res) => res.redirect(urlAutorizacion()));

app.get("/api/ml/conectado", async (req, res) => {
  try {
    const r = await conectarConCode(String(req.query.code || ""));
    const aviso = r.conRefresh
      ? "<p>Renovación automática activa: no hay que volver a hacerlo. Ya podés cerrar esta pestaña. ✅</p>"
      : "<p>⚠ Mercado Libre no entregó token de renovación: en developers.mercadolibre.com, editar la app y marcar el permiso <b>offline_access</b>, y volver a entrar a /api/ml/conectar.</p>";
    res.send(`<body style="font-family:sans-serif;background:#0d0d10;color:#fff;text-align:center;padding-top:80px">
      <h2>✅ Cuenta de Mercado Libre conectada (usuario ${r.usuario})</h2>${aviso}</body>`);
  } catch (e) {
    res.status(400).send(`<body style="font-family:sans-serif;background:#0d0d10;color:#fff;text-align:center;padding-top:80px">
      <h2>❌ No se pudo conectar: ${String(e.message || e)}</h2><p>Probá de nuevo entrando a /api/ml/conectar.</p></body>`);
  }
});

// Venta hecha por FUERA de ML (web o link de Max): baja el stock en ML.
// Autenticado con el mismo token compartido que el aviso de ventas.
// body: { ref, items?: [{id, qty}] } — sin items, busca el mapeo del link de Max.
app.post("/api/ml/venta", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = process.env.NOTIFY_TOKEN;
  if (!token || auth !== `Bearer ${token}`) return res.status(401).json({ error: "no autorizado" });
  try {
    const r = await descontarVenta(String(req.body?.ref || ""), req.body?.items);
    res.json(r);
  } catch (e) {
    console.error("Descuento de stock falló:", e.message);
    res.status(503).json({ ok: false, motivo: String(e.message || e) });
  }
});

// Ventas hechas DENTRO de Mercado Libre entre dos fechas ISO (para el reporte
// diario de la web). Mismo token compartido que /api/ml/venta.
app.get("/api/ml/ordenes", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = process.env.NOTIFY_TOKEN;
  if (!token || auth !== `Bearer ${token}`) return res.status(401).json({ error: "no autorizado" });
  try {
    res.json(await ordenesML(String(req.query.desde || ""), String(req.query.hasta || "")));
  } catch (e) {
    console.error("Órdenes ML falló:", e.message);
    res.status(503).json({ ok: false, motivo: String(e.message || e) });
  }
});

// Fuerza una sincronización con Mercado Libre AHORA y devuelve el resultado
// (para verificar la config sin esperar al ciclo de 6 h ni revisar logs).
app.get("/api/sync-ahora", async (_req, res) => {
  const r = await sincronizar();
  res.json({ resultado: r, catalogo: infoCatalogo() });
});

// Catálogo en vivo para consumir desde la web (lacasadelcubreasiento.com.uy).
// Público y de solo lectura (son los mismos productos que ya están en ML).
// CORS abierto para que el sitio en Vercel lo pueda leer desde el navegador.
// Cada producto: { n: nombre, p: precio venta, l: precio lista/tachado|null,
//                  img: foto, usd: 1 si está en dólares, u: link a la publicación de ML }
app.get("/api/catalogo", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=300"); // 5 min de caché en el borde
  const info = infoCatalogo();
  res.json({ moneda: "UYU", actualizado: info.actualizado, fuente: info.fuente, cantidad: info.cantidad, productos: productos() });
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
  // Sincronización automática del catálogo con la API de Mercado Libre cada 30 min
  // (y además se fuerza una sync inmediata después de cada venta que baja stock).
  programarSync(0.5);
});
