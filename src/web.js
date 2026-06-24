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
import { reiniciar, historial, agregar, cargarConversaciones, ultimasConversaciones, conversacionesEntre, reclamarTareaUnica } from "./memoria.js";
import { cargarLecciones, programarAprendizaje, analizarAhora, estadoAprendizaje } from "./aprendizaje.js";
import { sleep, delayEscritura } from "./humano.js";
import { programarSync, haySyncML, ultimaSync, sincronizar } from "./sync_ml.js";
import { infoCatalogo, productos } from "./catalogo_vivo.js";
import { hayMercadoPago } from "./pagos.js";
import { proveedorIA } from "./config.js";
import { enviarAviso, enviarTexto, hayWhatsApp, linkWa } from "./notificador.js";
import { urlAutorizacion, conectarConCode, hayUsuarioML, infoUsuarioML } from "./ml_user.js";
import { descontarVenta } from "./ml_stock.js";
import { ordenesML } from "./ml_ordenes.js";
import { estadoQR } from "./qr_estado.js";
import { resumenMensajes } from "./metricas.js";
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
  const qr = estadoQR();
  res.json({
    // Estado de WhatsApp: lo más importante para saber por qué Max no contesta.
    //  on        → WHATSAPP_ON=1 (el bot arranca el módulo de WhatsApp)
    //  conectado → el socket de Baileys está vivo AHORA
    //  hayQr     → hay un QR pendiente de escanear (sesión caída: hay que reescanear)
    //  keepAlive → APP_URL configurada (sin esto Render Free duerme y desconecta)
    whatsapp: {
      on: process.env.WHATSAPP_ON === "1",
      conectado: hayWhatsApp(),
      hayQr: !!qr.qr,
      keepAlive: !!(process.env.APP_URL || "").trim(),
    },
    catalogo: infoCatalogo(), syncML: haySyncML(), ultimaSync: ultimaSync(), mlUsuario: await hayUsuarioML(), mercadoPago: hayMercadoPago(), ia: { proveedor: ia.nombre, modelo: ia.model },
  });
});

// Cuántos mensajes respondió Max y a cuántas conversaciones atendió (hoy/7/30 días).
// Privado: token compartido por header Bearer o ?clave= (mismo NOTIFY_TOKEN).
app.get("/api/metricas", async (req, res) => {
  const token = process.env.NOTIFY_TOKEN;
  const auth = req.headers.authorization || "";
  const clave = String(req.query.clave || "");
  if (!token || (auth !== `Bearer ${token}` && clave !== token))
    return res.status(401).json({ error: "no autorizado" });
  res.json(await resumenMensajes());
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

// ── Ver las últimas conversaciones de Max (para analizar cómo conversó) ──
// Protegido con ?clave=<NOTIFY_TOKEN>, igual que el QR. Limpia el contexto interno
// (lo que va después del separador invisible ⁣) que el cliente nunca ve.
function limpiarMensajes(mensajes) {
  return (mensajes || []).map((m) => ({
    role: m.role,
    content: String(m.content || "").split("⁣")[0].trim(),
  })).filter((m) => m.content);
}

app.get("/api/conversaciones", async (req, res) => {
  if (!qrAutorizado(req)) return res.status(401).json({ error: "no autorizado" });
  const n = Math.min(Math.max(parseInt(req.query.n) || 20, 1), 100);
  const convs = await ultimasConversaciones(n);
  res.json({ cantidad: convs.length, conversaciones: convs.map((c) => ({ chatId: c.chatId, actualizado: c.actualizado, mensajes: limpiarMensajes(c.mensajes) })) });
});

// Página legible (móvil) para LEER las últimas charlas desde el celular.
app.get("/conversaciones", async (req, res) => {
  if (!qrAutorizado(req)) return res.status(401).send("No autorizado. Agregá ?clave=TU_NOTIFY_TOKEN al final del link.");
  const n = Math.min(Math.max(parseInt(req.query.n) || 20, 1), 100);
  const convs = await ultimasConversaciones(n);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtFecha = (f) => f ? new Date(f).toLocaleString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const idCorto = (id) => esc(String(id).split(/[:@]/)[0]);
  const bloques = convs.map((c) => {
    const msgs = limpiarMensajes(c.mensajes).map((m) => {
      const esMax = m.role === "assistant";
      return `<div class="msg ${esMax ? "bot" : "cli"}"><b>${esMax ? "Max" : "Cliente"}:</b> ${esc(m.content)}</div>`;
    }).join("");
    return `<div class="conv"><div class="head">📱 ${idCorto(c.chatId)} <span class="fecha">${esc(fmtFecha(c.actualizado))}</span></div>${msgs || '<div class="msg">(sin mensajes)</div>'}</div>`;
  }).join("");
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conversaciones de Max</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;background:#0d0d10;color:#e8e8ea;margin:0;padding:12px;}
  h1{font-size:18px;margin:6px 4px 14px;}
  .conv{background:#16161b;border:1px solid #26262e;border-radius:12px;padding:10px;margin-bottom:14px;}
  .head{font-size:13px;color:#9aa;border-bottom:1px solid #26262e;padding-bottom:6px;margin-bottom:8px;display:flex;justify-content:space-between;}
  .fecha{color:#667;}
  .msg{padding:6px 10px;border-radius:10px;margin:5px 0;font-size:15px;line-height:1.35;max-width:90%;}
  .cli{background:#222630;align-self:flex-start;}
  .bot{background:#143a2a;margin-left:auto;}
  .msg b{color:#8fb;font-weight:600;}
  .cli b{color:#9bd;}
</style></head><body>
<h1>Últimas ${convs.length} conversaciones de Max</h1>
${bloques || "<p>No hay conversaciones todavía.</p>"}
</body></html>`);
});

// ── RECUPERAR VENTAS POR LINK DE PAGO (de un día que quedó sin avisar bien) ──
// Busca las conversaciones recientes donde MAX MANDÓ UN LINK DE PAGO y le reenvía
// al equipo, por cada una, el LINK A LA CONVERSACIÓN del cliente (wa.me) + un
// resumen de la charla, para que los asesores puedan entrar al chat y seguir la
// venta. Pensado para arreglar a mano las ventas que quedaron sin el dato del
// cliente (antes de guardar la conversación junto al link).
//
//   Previsualizar (NO manda nada):  /api/recuperar-ventas?clave=NOTIFY_TOKEN
//   Reenviar de verdad al equipo:   /api/recuperar-ventas?clave=NOTIFY_TOKEN&enviar=1
//   Cambiar la ventana de tiempo:   ...&horas=24   (por defecto, las últimas 24 h)
//
// Detecta el link de Mercado Pago en lo que escribió Max. El teléfono sale del
// chat_id (en WhatsApp es el número); para chats @lid (sin número) se indica que
// busquen la conversación en el WhatsApp del negocio.
const RE_LINK_PAGO = /(https?:\/\/[^\s]*(?:mercadopago|mpago|mp\.la)[^\s]*)/i;
const MAX_RECUPERAR = 50; // tope sano de avisos a reenviar de una

function telDeChatId(chatId) {
  const s = String(chatId || "");
  if (!s.includes("@s.whatsapp.net")) return ""; // @lid u otros: no es un teléfono real
  return s.split("@")[0];
}

const fmtFechaUY = (f) => f ? new Date(f).toLocaleString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

// Busca en las últimas `horas` las charlas donde MAX mandó un link de pago de
// Mercado Pago. Devuelve los datos que el equipo necesita para seguir la venta.
async function buscarVentasConLink(horas) {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - horas * 3600 * 1000);
  const convs = await conversacionesEntre(desde.toISOString(), hasta.toISOString());
  const ventas = [];
  for (const c of convs) {
    const msgs = limpiarMensajes(c.mensajes);
    const conLink = msgs.find((m) => m.role === "assistant" && RE_LINK_PAGO.test(m.content));
    if (!conLink) continue;
    const link = (conLink.content.match(RE_LINK_PAGO) || [])[1] || "";
    const tel = telDeChatId(c.chatId);
    ventas.push({
      chatId: c.chatId,
      telefono: tel,
      conversacion: linkWa(tel) || null,
      linkPago: link,
      actualizado: c.actualizado,
      ultimos: msgs.slice(-8),
    });
  }
  return { ventas: ventas.slice(0, MAX_RECUPERAR), desde, hasta };
}

// Reenvía al WhatsApp del negocio (NUMERO_AVISOS, donde Max siempre avisa) una
// notificación por cada venta, con el cliente, el link a la conversación y un
// resumen de la charla. Devuelve cuántas mandó.
async function reenviarVentas(ventas, horas) {
  if (!ventas.length) return 0;
  let enviadas = 0;
  await enviarTexto(`🔁 RECUPERACIÓN DE VENTAS — encontré ${ventas.length} charla(s) de las últimas ${horas} h donde Max mandó un link de pago. Te paso, de cada una, el cliente y el chat para que verifiquen el pago y la sigan:`);
  for (const v of ventas) {
    const linkConv = v.conversacion ? `👉 ${v.conversacion}` : "Buscá la conversación en el WhatsApp del negocio (no quedó el número).";
    const charla = v.ultimos
      .map((m) => `${m.role === "assistant" ? "Max" : "Cliente"}: ${m.content}`)
      .join("\n")
      .slice(0, 1200);
    const texto = [
      "🛒 VENTA POR LINK DE PAGO (recuperada)",
      `👤 Cliente: ${v.telefono || "(sin número)"}`,
      `💬 Entrá a la conversación: ${linkConv}`,
      v.linkPago ? `🔗 Link de pago que se le envió: ${v.linkPago}` : "",
      v.actualizado ? `🕗 Última actividad: ${fmtFechaUY(v.actualizado)}` : "",
      "———",
      charla,
    ].filter(Boolean).join("\n");
    await enviarTexto(texto);
    enviadas++;
    await sleep(800); // pequeño respiro entre avisos
  }
  return enviadas;
}

// ── RECUPERAR VENTAS POR LINK DE PAGO (de un día que quedó sin avisar bien) ──
// Le reenvía al WhatsApp del negocio, por cada charla donde Max mandó un link de
// pago, el LINK A LA CONVERSACIÓN del cliente (wa.me) + un resumen, para que los
// asesores entren al chat y sigan la venta. Sirve para arreglar a mano las ventas
// que quedaron sin el dato del cliente.
//
//   Previsualizar (NO manda nada):  /api/recuperar-ventas?clave=NOTIFY_TOKEN
//   Reenviar de verdad al equipo:   /api/recuperar-ventas?clave=NOTIFY_TOKEN&enviar=1
//   Cambiar la ventana de tiempo:   ...&horas=24   (por defecto, las últimas 24 h)
app.get("/api/recuperar-ventas", async (req, res) => {
  if (!qrAutorizado(req)) return res.status(401).json({ error: "no autorizado" });
  const enviar = String(req.query.enviar || "") === "1";
  const horas = Math.min(Math.max(parseInt(req.query.horas) || 24, 1), 240);
  const { ventas, desde, hasta } = await buscarVentasConLink(horas);

  if (!enviar) {
    return res.json({
      modo: "previsualizacion",
      aviso: "Agregá &enviar=1 para reenviarle estos datos al equipo por WhatsApp.",
      ventana: { desde: desde.toISOString(), hasta: hasta.toISOString() },
      encontradas: ventas.length,
      ventas,
    });
  }

  if (!hayWhatsApp()) return res.status(503).json({ ok: false, motivo: "WhatsApp no está conectado en el servidor." });
  if (!ventas.length) return res.json({ ok: true, enviadas: 0, mensaje: "No encontré ventas con link de pago en la ventana indicada." });

  try {
    const enviadas = await reenviarVentas(ventas, horas);
    res.json({ ok: true, enviadas, deTotal: ventas.length });
  } catch (e) {
    console.error("Recuperar ventas falló:", e.message);
    res.status(503).json({ ok: false, motivo: String(e.message || e) });
  }
});

// Reenvío AUTOMÁTICO al arrancar: una sola vez por día, en cuanto WhatsApp esté
// conectado, reenvía al negocio las ventas por link de pago de las últimas 24 h.
// Idempotente entre reinicios de Render (candado en la base). Así las ventas de
// hoy se renotifican con los datos del cliente sin tener que tocar ninguna URL.
async function reenvioAutomaticoVentas() {
  try {
    // Esperar a que WhatsApp conecte (hasta ~90 s). Sin conexión, no enviamos:
    // el candado NO se reclama, así reintenta en el próximo arranque.
    for (let i = 0; i < 30 && !hayWhatsApp(); i++) await sleep(3000);
    if (!hayWhatsApp()) {
      console.log("↩ reenvío automático: WhatsApp no conectó; reintenta en el próximo arranque.");
      return;
    }
    const horas = 24;
    const { ventas } = await buscarVentasConLink(horas);
    if (!ventas.length) {
      console.log("↩ reenvío automático: no hay ventas con link de pago en las últimas 24 h.");
      return;
    }
    // Candado: una vez por día. Se reclama recién acá (con ventas y WhatsApp listo)
    // para no "quemar" el día si no había nada para mandar.
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" }); // YYYY-MM-DD
    const reclamada = await reclamarTareaUnica(`reenvio-ventas-${hoy}`);
    if (!reclamada) {
      console.log(`↩ reenvío automático (${hoy}): ya se hizo antes; no repito.`);
      return;
    }
    const enviadas = await reenviarVentas(ventas, horas);
    console.log(`✅ reenvío automático: renotifiqué ${enviadas} venta(s) de hoy al WhatsApp del negocio.`);
  } catch (e) {
    console.log("⚠ reenvío automático de ventas falló:", e.message);
  }
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
  // RENOTIFICAR las ventas por link de pago de hoy (una sola vez, cuando WhatsApp
  // esté conectado): así los avisos que salieron sin datos del cliente vuelven a
  // llegar al negocio con el cliente y el link a la conversación.
  reenvioAutomaticoVentas();
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
