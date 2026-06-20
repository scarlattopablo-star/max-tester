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
import { reiniciar, historial, agregar, cargarConversaciones } from "./memoria.js";
import { cargarLecciones, programarAprendizaje, analizarAhora, estadoAprendizaje } from "./aprendizaje.js";
import { sleep, delayEscritura } from "./humano.js";
import { programarSync, haySyncML, ultimaSync, sincronizar } from "./sync_ml.js";
import { infoCatalogo, productos } from "./catalogo_vivo.js";
import { hayMercadoPago } from "./pagos.js";
import { proveedorIA } from "./config.js";
import { enviarAviso, hayWhatsApp } from "./notificador.js";
import { urlAutorizacion, conectarConCode, hayUsuarioML, infoUsuarioML } from "./ml_user.js";
import { descontarVenta } from "./ml_stock.js";
import { ordenesML } from "./ml_ordenes.js";
import { estadoQR } from "./qr_estado.js";
import QRCode from "qrcode";

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

// ── Vinculación de WhatsApp por la WEB (para escanear el QR sin la terminal) ──
// Protegido con ?clave=<NOTIFY_TOKEN>. Requiere WHATSAPP_ON=1 en Render.
function qrAutorizado(req) {
  const token = process.env.NOTIFY_TOKEN;
  return token && String(req.query.clave || "") === token;
}

app.get("/api/qr", (req, res) => {
  if (!qrAutorizado(req)) return res.status(401).json({ error: "no autorizado" });
  const e = estadoQR();
  // No mandamos el string del QR al navegador: solo si HAY uno y el estado.
  res.json({ conectado: e.conectado, hayQr: !!e.qr, ts: e.ts, whatsappOn: process.env.WHATSAPP_ON === "1" });
});

// El QR como IMAGEN PNG generada en el servidor (no depende de nada del navegador).
app.get("/qr.png", async (req, res) => {
  if (!qrAutorizado(req)) return res.status(401).end();
  const { qr } = estadoQR();
  if (!qr) return res.status(404).end();
  try {
    const buf = await QRCode.toBuffer(qr, { width: 320, margin: 1, errorCorrectionLevel: "M" });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    res.send(buf);
  } catch {
    res.status(500).end();
  }
});

app.get("/qr", (req, res) => {
  if (!qrAutorizado(req)) return res.status(401).send("No autorizado.");
  const clave = encodeURIComponent(String(req.query.clave || ""));
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Conectar WhatsApp · Max</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#0d0d10;color:#fff;text-align:center;padding:28px 16px}
  h1{font-size:20px;margin:0 0 4px} p{color:#bebec6;margin:6px auto;max-width:420px;line-height:1.5;font-size:14px}
  #box{background:#fff;display:inline-block;padding:14px;border-radius:16px;margin-top:18px;min-width:300px;min-height:300px}
  #box img{display:block;width:300px;height:300px}
  #estado{margin-top:18px;font-size:15px;font-weight:700}
  .ok{color:#2ecc71} .wait{color:#f0b429}
  ol{text-align:left;max-width:420px;margin:18px auto;color:#bebec6;font-size:14px;line-height:1.7}
</style></head>
<body>
  <h1>🤖 Conectar a Max por WhatsApp</h1>
  <p>Escaneá este código con el celular del <b>chip dedicado</b> del bot.</p>
  <div id="box"><img id="qr" alt="QR" src="/qr.png?clave=${clave}"></div>
  <div id="estado" class="wait">Generando código…</div>
  <ol>
    <li>En el celular del chip de Max: WhatsApp → <b>⚙️ Configuración</b>.</li>
    <li><b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>.</li>
    <li>Apuntá la cámara a este código.</li>
  </ol>
  <script>
    var clave="${clave}";
    async function tick(){
      try{
        var r=await fetch("/api/qr?clave="+clave,{cache:"no-store"});
        var d=await r.json();
        var est=document.getElementById("estado"), box=document.getElementById("box");
        if(d.conectado){est.className="ok";est.textContent="✅ ¡Conectado! Ya podés cerrar esta página.";box.style.display="none";return;}
        if(!d.whatsappOn){est.className="wait";est.textContent="⏳ Activando WhatsApp… esperá unos segundos.";}
        else if(d.hayQr){
          // refresca la imagen (el QR se renueva solo cada ~20s)
          document.getElementById("qr").src="/qr.png?clave="+clave+"&t="+Date.now();
          est.className="wait";est.textContent="📲 Escaneá el código (se renueva solo)";
        } else {est.className="wait";est.textContent="⏳ Generando código…";}
      }catch(e){}
      setTimeout(tick,4000);
    }
    tick();
  </script>
</body></html>`);
});

// Diagnóstico: qué cuenta de ML quedó conectada (para verificar que sea EVERBOX).
app.get("/api/ml/quien", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = process.env.NOTIFY_TOKEN;
  if (!token || auth !== `Bearer ${token}`) return res.status(401).json({ error: "no autorizado" });
  res.json(await infoUsuarioML());
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

// ── Aprendizaje de Max: ver qué aprendió y forzar un análisis ──────────────
// Protegido con el token compartido (NOTIFY_TOKEN) por querystring ?clave=.
app.get("/api/aprendizaje", (req, res) => {
  if (String(req.query.clave || "") !== process.env.NOTIFY_TOKEN) return res.status(401).json({ error: "no autorizado" });
  res.json(estadoAprendizaje());
});

app.get("/api/aprender-ahora", async (req, res) => {
  if (String(req.query.clave || "") !== process.env.NOTIFY_TOKEN) return res.status(401).json({ error: "no autorizado" });
  res.json(await analizarAhora());
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
  // Memoria de conversaciones (Neon) + aprendizaje: cargar lo guardado y programar
  // el análisis diario con Gemini (gratis).
  cargarConversaciones();
  cargarLecciones().then(programarAprendizaje);
  // KEEP-ALIVE: Render plan Free duerme el servicio tras 15 min sin tráfico, y al
  // dormirse se DESCONECTA WhatsApp (Max deja de contestar). Nos auto-pingueamos
  // cada 10 min para mantenerlo despierto 24/7. Solo si hay URL pública (APP_URL):
  // en local no hace falta. Tolerante a fallos (no debe tirar el server).
  const urlPublica = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (urlPublica) {
    const pingear = async () => {
      try {
        const r = await fetch(`${urlPublica}/api/estado`, { signal: AbortSignal.timeout(20_000) });
        console.log(`💓 keep-alive ${urlPublica} → ${r.status}`);
      } catch (e) {
        console.log(`💓 keep-alive falló: ${e.message}`);
      }
    };
    setInterval(pingear, 10 * 60 * 1000); // cada 10 min (< 15 min de Render Free)
    setTimeout(pingear, 30_000); // primer ping a los 30s de arrancar
    console.log(`💓 keep-alive activo contra ${urlPublica} (evita que Render duerma el bot)`);
  }
});
