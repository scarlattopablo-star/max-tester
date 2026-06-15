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
import { registrarSock, enviarTexto, linkWa } from "./notificador.js";
import { agregar } from "./memoria.js";
import { useDBAuthState } from "./auth_db.js";
import { setQR, setConectado } from "./qr_estado.js";

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

// Teléfono REAL del cliente para armar el link wa.me. Con el nuevo
// direccionamiento de WhatsApp el remoteJid puede ser un "@lid" (que NO es el
// número); el número real viene en senderPn/participant.
function telDeMsg(msg, jid) {
  // remoteJidAlt / participantPn: en chats "@lid" Baileys 7 deja acá el número REAL.
  const fuentes = [
    msg?.key?.senderPn,
    msg?.key?.participantPn,
    msg?.key?.remoteJidAlt,
    msg?.key?.participant,
    jid,
  ];
  for (const f of fuentes) {
    const s = String(f || "");
    if (!s || s.includes("@lid")) continue; // @lid no es teléfono
    const d = s.split(/[:@]/)[0].replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 15) return d;
  }
  return "";
}

async function iniciar() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠ Falta ANTHROPIC_API_KEY en .env — el bot no va a poder responder. Copiá .env.example a .env.");
  }

  // Con DATABASE_URL la sesión vive en Neon (sobrevive a Render); sin ella, en disco como siempre.
  const { state, saveCreds } = process.env.DATABASE_URL
    ? await useDBAuthState()
    : await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({ auth: state, logger: noopLogger, markOnlineOnConnect: false });

  sock.ev.on("creds.update", saveCreds);

  let arranqueTs = Math.floor(Date.now() / 1000); // para ignorar mensajes viejos

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log(`\n📲 Escaneá este QR con el WhatsApp del bot (${NEGOCIO.nombre}):\n`);
      qrcode.generate(qr, { small: true });
      console.log("\nWhatsApp del celular → Dispositivos vinculados → Vincular un dispositivo.\n");
      setQR(qr); // disponible también en la página web /qr
    }
    if (connection === "open") {
      console.log("✅ Conectado a WhatsApp. El bot ya está atendiendo.");
      arranqueTs = Math.floor(Date.now() / 1000); // mensajes anteriores a esto se ignoran
      setConectado(true);
      registrarSock(sock, marcarEnviado); // el notificador también registra sus IDs enviados
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const cerroSesion = code === DisconnectReason.loggedOut;
      if (cerroSesion) setConectado(false);
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

  // ── Handoff humano por conversación ───────────────────────────────
  // Si alguien del equipo le responde a un cliente desde el teléfono del bot,
  // Max se calla SOLO en esa conversación y retoma cuando el humano deja de
  // responder por 10 minutos (con todo el contexto guardado en memoria).
  const VENTANA_HUMANO_MS = 10 * 60 * 1000; // 10 min sin que el equipo escriba => Max retoma
  const enviadosPorMax = new Set(); // IDs de mensajes que mandó Max (para distinguirlos del humano)
  const humanoHasta = new Map(); // jid -> timestamp (ms) del último mensaje del humano
  const pedidosAvisados = new Set(); // ids de pedido ya avisados al equipo (no duplicar)
  const contactoCliente = new Map(); // jid -> { nombre, tel } para armar el link en los avisos

  // Registra el ID de un mensaje que envió Max (o el notificador), para que en
  // messages.upsert no lo confundamos con un humano escribiendo desde el teléfono.
  function marcarEnviado(sent) {
    const id = sent?.key?.id;
    if (!id) return;
    enviadosPorMax.add(id);
    // Tope de tamaño: si supera 500, descartamos los más viejos (el Set itera en orden de inserción).
    if (enviadosPorMax.size > 500) {
      for (const viejo of enviadosPorMax) {
        enviadosPorMax.delete(viejo);
        if (enviadosPorMax.size <= 500) break;
      }
    }
  }

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
      const { texto: respuesta, acciones, imagenesEnviar = [] } = await procesarMensaje({ chatId: jid, texto, canal: "whatsapp", imagenes });
      // Si el cliente escribió MÁS mientras Max pensaba, no mandamos esta respuesta:
      // reprocesamos para considerar también esos mensajes nuevos.
      if (b.textos.length || b.imagenes.length) {
        procesando.delete(jid);
        return procesar(jid);
      }
      await sock.sendPresenceUpdate("composing", jid);
      await sleep(delayEscritura(respuesta));
      await sock.sendPresenceUpdate("paused", jid);
      marcarEnviado(await sock.sendMessage(jid, { text: respuesta }));
      // Si Max decidió mandar fotos, las enviamos de a UNA, con una pequeña espera
      // entre cada una (mostrando "escribiendo…") para que se sienta humano.
      for (const f of imagenesEnviar) {
        try {
          await sock.sendPresenceUpdate("composing", jid);
          await sleep(1000 + Math.floor(Math.random() * 1000)); // 1 a 2 s entre fotos
          await sock.sendPresenceUpdate("paused", jid);
          marcarEnviado(await sock.sendMessage(jid, { image: { url: f.url }, caption: f.caption || "" }));
        } catch (e) { console.log("⚠ no pude enviar foto:", e.message); }
      }
      console.log(`📤 ${jid}: ${respuesta}` + (imagenesEnviar.length ? ` (+${imagenesEnviar.length} foto)` : ""));
      for (const a of acciones) console.log(`   ⚙ ${a.herramienta} → ${JSON.stringify(a.resultado)}`);
      // Link a la conversación del cliente para que el asesor entre directo.
      // Mejor teléfono disponible: el capturado del mensaje, o el que pasó la herramienta.
      const contacto = contactoCliente.get(jid) || {};
      const linkBase = (telExtra) =>
        linkWa(contacto.tel || telExtra)
          ? `👉 ${linkWa(contacto.tel || telExtra)}`
          : "Buscá la conversación del cliente en el WhatsApp del negocio.";
      const linkConversacion = linkBase();
      const lineaCliente = contacto.nombre ? `👤 ${contacto.nombre}` : "";

      // DERIVACIÓN: aviso DIFERENCIADO según el motivo, con link a la conversación.
      for (const a of acciones) {
        if (a.herramienta !== "derivar_a_humano") continue;
        try {
          const d = a.resultado?.derivacion || a.input || {}; // motivo, resumen, nombre, telefono
          const linkConversacion = linkBase(d.telefono); // si la herramienta trajo teléfono, lo usamos
          let lineas;
          if (d.motivo === "pide_humano") {
            lineas = [
              "🙋 UN CLIENTE PIDE HABLAR CON UN ASESOR",
              d.resumen ? `📝 ${d.resumen}` : "",
              lineaCliente,
              `💬 Entrá a la conversación: ${linkConversacion}`,
            ];
          } else {
            lineas = [
              "❓ MAX NO PUDO RESOLVER — necesita un asesor",
              `Motivo: ${d.motivo || "otro"}${d.resumen ? ` · ${d.resumen}` : ""}`,
              lineaCliente,
              `💬 Entrá a la conversación: ${linkConversacion}`,
            ];
          }
          await enviarTexto(lineas.filter(Boolean).join("\n"));
        } catch (e) {
          console.log(`⚠ No pude avisar la derivación al negocio: ${e.message}`);
        }
      }
      // VENTA: cuando Max toma un pedido (cliente que decidió comprar / dijo que
      // pagó por transferencia), avisamos al equipo con link a la conversación.
      // (El pago por Mercado Pago se avisa aparte, desde el webhook, al acreditarse.)
      for (const a of acciones) {
        if (a.herramienta !== "tomar_pedido") continue;
        const p = a.resultado?.pedido;
        if (!p || pedidosAvisados.has(p.id)) continue;
        pedidosAvisados.add(p.id);
        try {
          const lineas = [
            "🛒 NUEVA VENTA — Max cerró un pedido",
            `Producto: ${p.producto || "?"}${p.modeloVehiculo ? ` · ${p.modeloVehiculo}` : ""}`,
            p.medioPago ? `💳 Pago: ${p.medioPago}` : "",
            lineaCliente || ([p.nombre, p.telefono].filter(Boolean).length ? `👤 ${[p.nombre, p.telefono].filter(Boolean).join(" · ")}` : ""),
            p.notas ? `📝 ${p.notas}` : "",
            `💬 Verificá el pago y coordiná la entrega: ${linkConversacion}`,
          ].filter(Boolean);
          await enviarTexto(lineas.join("\n"));
        } catch (e) {
          console.log(`⚠ No pude avisar el pedido al negocio: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`⚠ Error respondiendo a ${jid}: ${e.message}`);
      try { marcarEnviado(await sock.sendMessage(jid, { text: "Disculpá, tuve un problemita técnico. ¿Me lo repetís o preferís que te pase con un asesor? 🙏" })); } catch {}
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
      const jid = msg.key.remoteJid || "";
      if (jid === "status@broadcast" || jid.endsWith("@g.us")) continue; // ignorar estados y grupos

      // FILTRO DE TIEMPO: ignoramos mensajes anteriores a cuando Max se conectó
      // (backlog que WhatsApp re-entrega al reconectar). Así Max nunca responde
      // algo viejo de la nada. 60 s de margen por desfasajes de reloj.
      const ts = Number(msg.messageTimestamp?.toNumber?.() ?? msg.messageTimestamp ?? 0);
      if (ts && arranqueTs && ts < arranqueTs - 60) continue;

      if (msg.key.fromMe) {
        if (enviadosPorMax.has(msg.key.id)) continue; // lo mandó Max: nada que hacer
        // Solo cuenta como "humano atendiendo" si hay CONTENIDO real (texto, foto,
        // audio, etc.). Reacciones, borrados o pins también llegan con fromMe y NO
        // deben silenciar a Max (un 👍 del dueño no es una atención en curso).
        // Nota: el eco de los envíos propios de Max llega como type "append" (se
        // filtra arriba); este branch depende de eso + del Set enviadosPorMax.
        const textoHumano = textoDelMensaje(msg);
        const m = msg.message || {};
        const esContenido = textoHumano || m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage;
        if (!esContenido) continue;
        // Lo escribió un HUMANO del equipo desde el teléfono del bot: Max se PAUSA
        // SOLO en esta conversación (handoff temporal) y RETOMA a los 10 min sin
        // respuesta del humano. Vale para cualquier conversación: así una charla
        // NUEVA nunca queda sin responder (Max vuelve solo).
        humanoHasta.set(jid, Date.now());
        for (const [j, t] of humanoHasta) if (Date.now() - t > VENTANA_HUMANO_MS) humanoHasta.delete(j);
        if (textoHumano) agregar(jid, "assistant", textoHumano);
        console.log(`🧑 el equipo escribió en ${jid}: Max en pausa ${VENTANA_HUMANO_MS / 60000} min (retoma solo)`);
        continue;
      }

      const texto = textoDelMensaje(msg);
      const tieneFoto = !!msg.message?.imageMessage;

      if (!texto && !tieneFoto) continue; // ignoramos audios/stickers/etc por ahora

      // Guardamos nombre y teléfono del cliente para los avisos al equipo (link a la conversación).
      const telCliente = telDeMsg(msg, jid);
      contactoCliente.set(jid, { nombre: msg.pushName || "", tel: telCliente });
      // Diagnóstico: si NO pudimos sacar el teléfono, mostramos los campos de la key
      // para saber de dónde tomarlo (chats @lid del nuevo direccionamiento de WhatsApp).
      if (!telCliente) {
        console.log("⚠ sin teléfono para el link. key:", JSON.stringify({
          remoteJid: msg.key?.remoteJid, remoteJidAlt: msg.key?.remoteJidAlt,
          senderPn: msg.key?.senderPn, participant: msg.key?.participant, participantPn: msg.key?.participantPn,
        }));
      }

      // ¿Hay un humano atendiendo esta conversación? Max no responde, pero guarda
      // el mensaje en memoria para retomar con todo el contexto cuando pase la ventana.
      const marcaHumano = humanoHasta.get(jid);
      if (marcaHumano && Date.now() - marcaHumano < VENTANA_HUMANO_MS) {
        agregar(jid, "user", texto || "[el cliente mandó una foto]");
        console.log(`🤫 humano activo en ${jid}, Max en silencio`);
        continue;
      }
      if (marcaHumano) humanoHasta.delete(jid); // pasaron los 10 min: Max retoma

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
