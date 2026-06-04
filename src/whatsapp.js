// Conexión REAL a WhatsApp con Baileys (https://baileys.wiki).
// Arranca solo cuando escaneás el QR con el chip DEDICADO del bot.
//   npm run whatsapp
import "./env.js";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from "baileys";
import qrcode from "qrcode-terminal";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { procesarMensaje } from "./handler.js";
import { NEGOCIO } from "./config.js";
import { sleep, delayEscritura } from "./humano.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, "..", "auth_baileys");

// Silenciamos el logger interno de Baileys (necesita uno tipo pino).
const noopLogger = { level: "silent", child: () => noopLogger, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };

function textoDelMensaje(msg) {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ""
  ).trim();
}

async function iniciar() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠ Falta ANTHROPIC_API_KEY en .env — el bot no va a poder responder. Copiá .env.example a .env.");
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({ auth: state, logger: noopLogger, markOnlineOnConnect: false });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log(`\n📲 Escaneá este QR con el WhatsApp del bot (${NEGOCIO.nombre}):\n`);
      qrcode.generate(qr, { small: true });
      console.log("\nWhatsApp del celular → Dispositivos vinculados → Vincular un dispositivo.\n");
    }
    if (connection === "open") {
      console.log("✅ Conectado a WhatsApp. El bot ya está atendiendo.");
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const cerroSesion = code === DisconnectReason.loggedOut;
      console.log(`🔌 Conexión cerrada (code ${code}).` + (cerroSesion ? " Sesión cerrada: borrá auth_baileys/ y volvé a escanear." : " Reintentando…"));
      if (!cerroSesion) iniciar();
    }
  });

  // ── Manejo de mensajes con BUFFER + COLA ──────────────────────────
  // Si el cliente manda varios mensajes seguidos (o "corta" a Vale mientras
  // escribe), no respondemos a cada uno: esperamos una ventana corta, juntamos
  // todo y respondemos UNA vez considerando todos los mensajes.
  const VENTANA_MS = 3500; // cuánto espera para ver si el cliente sigue escribiendo
  const buffers = new Map(); // jid -> { textos: [], imagenes: [], timer }
  const procesando = new Set(); // jids que están generando respuesta ahora

  function encolar(jid, texto, imagenes = []) {
    const b = buffers.get(jid) || { textos: [], imagenes: [], timer: null };
    if (texto) b.textos.push(texto);
    if (imagenes.length) b.imagenes.push(...imagenes);
    if (b.timer) clearTimeout(b.timer);
    b.timer = setTimeout(() => { b.timer = null; procesar(jid); }, VENTANA_MS);
    buffers.set(jid, b);
  }

  async function procesar(jid) {
    if (procesando.has(jid)) return; // ya está respondiendo; lo nuevo queda en el buffer
    const b = buffers.get(jid);
    if (!b || (!b.textos.length && !b.imagenes.length)) return;

    const texto = b.textos.join("\n"); // junta todo lo que escribió el cliente
    const imagenes = b.imagenes;
    b.textos = [];
    b.imagenes = [];
    procesando.add(jid);
    try {
      await sock.sendPresenceUpdate("composing", jid);
      const { texto: respuesta, acciones } = await procesarMensaje({ chatId: jid, texto, canal: "whatsapp", imagenes });
      // Si el cliente escribió MÁS mientras Max pensaba, no mandamos esta respuesta:
      // reprocesamos para considerar también esos mensajes nuevos.
      if (b.textos.length || b.imagenes.length) {
        procesando.delete(jid);
        return procesar(jid);
      }
      await sock.sendPresenceUpdate("composing", jid);
      await sleep(delayEscritura(respuesta));
      await sock.sendPresenceUpdate("paused", jid);
      await sock.sendMessage(jid, { text: respuesta });
      console.log(`📤 ${jid}: ${respuesta}`);
      for (const a of acciones) console.log(`   ⚙ ${a.herramienta} → ${JSON.stringify(a.resultado)}`);
    } catch (e) {
      console.log(`⚠ Error respondiendo a ${jid}: ${e.message}`);
      try { await sock.sendMessage(jid, { text: "Disculpá, tuve un problemita técnico. ¿Me lo repetís o preferís que te pase con un asesor? 🙏" }); } catch {}
    } finally {
      procesando.delete(jid);
      // Si llegaron mensajes mientras respondíamos, los atendemos ahora.
      const b2 = buffers.get(jid);
      if (b2 && (b2.textos.length || b2.imagenes.length)) procesar(jid);
    }
  }

  // Descarga una imagen entrante de WhatsApp y la devuelve como data-URI base64.
  async function imagenComoDataUri(msg) {
    try {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: noopLogger, reuploadRequest: sock.updateMediaMessage });
      const mime = msg.message?.imageMessage?.mimetype || "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch (e) {
      console.log("⚠ No pude descargar la imagen:", e.message);
      return null;
    }
  }

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue; // no respondernos a nosotros mismos
      const jid = msg.key.remoteJid || "";
      if (jid === "status@broadcast" || jid.endsWith("@g.us")) continue; // ignorar estados y grupos

      const texto = textoDelMensaje(msg);
      const tieneFoto = !!msg.message?.imageMessage;

      if (!texto && !tieneFoto) continue; // ignoramos audios/stickers/etc por ahora

      let imagenes = [];
      if (tieneFoto) {
        const dataUri = await imagenComoDataUri(msg);
        if (dataUri) imagenes = [dataUri];
        console.log(`📩 ${jid}: [foto]${texto ? " " + texto : ""}`);
      } else {
        console.log(`📩 ${jid}: ${texto}`);
      }
      encolar(jid, texto, imagenes);
    }
  });
}

iniciar();
