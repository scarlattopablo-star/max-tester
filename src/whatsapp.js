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
import { registrarSock, desregistrarSock, enviarTexto, linkWa } from "./notificador.js";
import { agregar, cargarConversaciones } from "./memoria.js";
import { registrarMensajeMax } from "./metricas.js";
import { useDBAuthState } from "./auth_db.js";
import { setQR, setConectado } from "./qr_estado.js";
import { cargarEstado, esHumano, marcarHumano } from "./previas.js";
import { contenidoReal, textoDelMensaje, anuncioDelMensaje, telDeMsg, jidParaResponder } from "./ws_mensaje.js";
import { diag } from "./diag.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, "..", "auth_baileys");

// Silenciamos el logger interno de Baileys (necesita uno tipo pino).
const noopLogger = { level: "silent", child: () => noopLogger, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };

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

  await cargarEstado(); // conversaciones que ya tomó un asesor (Max no participa)
  await cargarConversaciones(); // memoria de chats (Neon): contexto que sobrevive a deploys
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
      diag("conexion", { estado: "conectado" });
      arranqueTs = Math.floor(Date.now() / 1000); // mensajes anteriores a esto se ignoran
      setConectado(true);
      registrarSock(sock, marcarEnviado); // el notificador también registra sus IDs enviados
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const cerroSesion = code === DisconnectReason.loggedOut;
      desregistrarSock(); // el socket dejó de servir: que hayWhatsApp() diga la verdad
      setConectado(false);
      diag("conexion", { estado: "cerrada", code });
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
  // Apenas un asesor escribe en una conversación desde el teléfono del bot, Max se
  // PAUSA en ese chat. La pausa NO es permanente: vence a las 3 h del último mensaje
  // del asesor y Max retoma solo si el cliente vuelve a escribir (ver previas.js).
  const enviadosPorMax = new Set(); // IDs de mensajes que mandó Max (para distinguirlos del humano)
  const idsVistos = new Set(); // IDs de mensajes ya procesados (anti-duplicados al reconectar)
  const pedidosAvisados = new Set(); // ids de pedido ya avisados al equipo (no duplicar)
  const turnosAvisados = new Set(); // ids de solicitud de turno ya avisados al equipo
  const contactoCliente = new Map(); // jid -> { nombre, tel } para armar el link en los avisos
  const jidEnvioDe = new Map(); // jid entrante -> jid al que responder (mapea @lid -> número real)
  const vaciosAvisados = new Map(); // jid -> ts del último saludo por mensaje vacío/no-legible (anti-spam)

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
    // Nombre y teléfono del cliente capturados del mensaje: se usan para los avisos
    // al equipo (link a la conversación) y para recordar de quién es un link de pago.
    const contacto = contactoCliente.get(jid) || {};
    // A dónde RESPONDER: si el cliente llegó como "@lid" (típico de los anuncios),
    // usamos su número real; si no, el mismo jid. La memoria/métricas siguen con el jid.
    const jidEnvio = jidEnvioDe.get(jid) || jid;
    try {
      await sock.sendPresenceUpdate("composing", jidEnvio);
      const { texto: respuesta, acciones, imagenesEnviar = [] } = await procesarMensaje({ chatId: jid, texto, canal: "whatsapp", imagenes, contacto });
      // Si el cliente escribió MÁS mientras Max pensaba, no mandamos esta respuesta:
      // reprocesamos para considerar también esos mensajes nuevos.
      if (b.textos.length || b.imagenes.length) {
        procesando.delete(jid);
        return procesar(jid);
      }
      await sock.sendPresenceUpdate("composing", jidEnvio);
      await sleep(delayEscritura(respuesta));
      await sock.sendPresenceUpdate("paused", jidEnvio);
      marcarEnviado(await sock.sendMessage(jidEnvio, { text: respuesta }));
      registrarMensajeMax(jid); // métrica: Max respondió a este cliente
      // Si Max decidió mandar fotos, las enviamos de a UNA, con una pequeña espera
      // entre cada una (mostrando "escribiendo…") para que se sienta humano.
      for (const f of imagenesEnviar) {
        try {
          await sock.sendPresenceUpdate("composing", jidEnvio);
          await sleep(1000 + Math.floor(Math.random() * 1000)); // 1 a 2 s entre fotos
          await sock.sendPresenceUpdate("paused", jidEnvio);
          marcarEnviado(await sock.sendMessage(jidEnvio, { image: { url: f.url }, caption: f.caption || "" }));
        } catch (e) { console.log("⚠ no pude enviar foto:", e.message); }
      }
      diag("respondido", { jid, jidEnvio, resumen: String(respuesta).slice(0, 80) });
      console.log(`📤 ${jid}: ${respuesta}` + (imagenesEnviar.length ? ` (+${imagenesEnviar.length} foto)` : ""));
      for (const a of acciones) console.log(`   ⚙ ${a.herramienta} → ${JSON.stringify(a.resultado)}`);
      // Link a la conversación del cliente para que el asesor entre directo.
      // Mejor teléfono disponible: el capturado del mensaje (contacto), o el que pasó la herramienta.
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
      // TURNO: el cliente quiere ir al local. Max NO confirma: avisa al equipo
      // con los datos para que el EQUIPO confirme el día y la hora.
      for (const a of acciones) {
        if (a.herramienta !== "solicitar_turno") continue;
        const tr = a.resultado?.turno;
        if (!tr || turnosAvisados.has(tr.id)) continue;
        turnosAvisados.add(tr.id);
        try {
          const cuando = [tr.fecha, tr.hora].filter(Boolean).join(" ");
          const lineas = [
            "🗓️ SOLICITUD DE TURNO — confirmá el día y la hora con el cliente",
            `👤 ${[tr.nombre, tr.telefono].filter(Boolean).join(" · ") || "(sin datos)"}`,
            tr.servicio ? `🔧 ${tr.servicio}` : "",
            tr.vehiculo ? `🚗 ${tr.vehiculo}` : "",
            cuando ? `📅 Prefiere: ${cuando}` : "📅 Sin preferencia de horario",
            `💬 Entrá a la conversación: ${linkConversacion}`,
          ].filter(Boolean);
          await enviarTexto(lineas.join("\n"));
        } catch (e) {
          console.log(`⚠ No pude avisar la solicitud de turno: ${e.message}`);
        }
      }
    } catch (e) {
      diag("error", { jid, jidEnvio, detalle: e.message });
      console.log(`⚠ Error respondiendo a ${jid}: ${e.message}`);
      try { marcarEnviado(await sock.sendMessage(jidEnvio, { text: "¡Perdón! Se me cruzó un cable 😅 ¿Me lo repetís?" })); }
      catch (e2) { diag("error_envio", { jid, jidEnvio, detalle: e2.message }); }
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
      const mime = contenidoReal(msg.message)?.imageMessage?.mimetype || "image/jpeg";
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

      // ANTI-DUPLICADOS: no procesar dos veces el mismo mensaje (WhatsApp puede
      // re-entregarlo al reconectar). Evita respuestas repetidas tras un deploy.
      if (msg.key.id) {
        if (idsVistos.has(msg.key.id)) continue;
        idsVistos.add(msg.key.id);
        if (idsVistos.size > 4000) idsVistos.clear(); // tope simple de memoria
      }

      // ¿Vino desde un anuncio de Instagram/Facebook (Click-to-WhatsApp)? Lo
      // detectamos temprano: son PRIMEROS CONTACTOS valiosísimos y no los queremos
      // perder aunque lleguen con demora (reconexión/deploy de Render).
      const anuncio = anuncioDelMensaje(msg);

      // FILTRO DE TIEMPO: solo descartamos lo REALMENTE viejo (backlog de un
      // pareo nuevo del QR). Render Free apaga el servicio y al reconectar WhatsApp
      // re-entrega los mensajes que llegaron mientras estaba dormido: ESOS los
      // queremos contestar aunque tengan un rato (antes el corte de 5 min los comía,
      // por eso Max no respondía a clics de anuncios fuera de horario). El
      // anti-duplicados de arriba evita responder dos veces el mismo mensaje.
      const EDAD_MAX_MIN = Number(process.env.MAX_MSG_EDAD_MIN || 720); // 12 h
      const ts = Number(msg.messageTimestamp?.toNumber?.() ?? msg.messageTimestamp ?? 0);
      const ahoraS = Math.floor(Date.now() / 1000);
      const demoraMin = ts ? Math.round((ahoraS - ts) / 60) : 0;
      if (ts && demoraMin > EDAD_MAX_MIN && !anuncio) continue;
      if (demoraMin > 5) {
        console.log(`⏱ mensaje con ${demoraMin} min de demora — lo atiendo igual${anuncio ? " (anuncio)" : ""}: ${jid}`);
      }

      if (msg.key.fromMe) {
        if (enviadosPorMax.has(msg.key.id)) continue; // lo mandó Max: nada que hacer
        // Solo cuenta como "humano atendiendo" si hay CONTENIDO real (texto, foto,
        // audio, etc.). Reacciones, borrados o pins también llegan con fromMe y NO
        // deben silenciar a Max (un 👍 del dueño no es una atención en curso).
        // Nota: el eco de los envíos propios de Max llega como type "append" (se
        // filtra arriba); este branch depende de eso + del Set enviadosPorMax.
        const textoHumano = textoDelMensaje(msg);
        const m = contenidoReal(msg.message);
        // SOLO un mensaje REAL del equipo pausa a Max. Abrir/leer el chat, reaccionar,
        // marcar como leído, etc. NO son mensajes → NO pausan (no llegan acá como contenido).
        const esContenido = textoHumano || m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage;
        if (!esContenido) {
          console.log(`(equipo, sin pausa en ${jid}: evento no-mensaje — ${Object.keys(m).join(",") || "vacío"})`);
          continue;
        }
        // Un ASESOR escribió desde el teléfono del bot → SE HIZO CARGO de esta
        // conversación: Max NO vuelve a participar en ella (permanente, persistido).
        marcarHumano(jid);
        if (textoHumano) agregar(jid, "assistant", textoHumano);
        console.log(`🧑 un asesor tomó la conversación ${jid}: Max no participa más acá`);
        continue;
      }

      const inner = contenidoReal(msg.message);
      let texto = textoDelMensaje(msg);
      const tieneFoto = !!inner.imageMessage;
      const esAudio = !!(inner.audioMessage || inner.pttMessage);

      // Mensaje desde un anuncio: lo registramos y, si no trajo texto ni foto
      // (algunos clicks llegan sin cuerpo), lo tratamos igual como una consulta
      // inicial para que Max salude y arranque la conversación en vez de ignorarlo.
      if (anuncio) {
        console.log(`📣 ${jid}: desde ANUNCIO${anuncio.titulo ? ` ("${anuncio.titulo}")` : ""}${anuncio.fuente ? ` — ${anuncio.fuente}` : ""}`);
        // Le pasamos el CONTEXTO del anuncio al cerebro (de qué trata: título/cuerpo)
        // para que Max oriente la respuesta a ESE producto en vez de saludar genérico.
        // El video/reel no viaja en el mensaje (no se puede ver), pero el título/texto sí.
        const partes = [];
        if (anuncio.titulo) partes.push(`sobre "${anuncio.titulo}"`);
        if (anuncio.cuerpo) partes.push(`— ${anuncio.cuerpo}`);
        const desc = partes.length ? ` ${partes.join(" ")}` : "";
        const ctxAnuncio = `[Contexto: el cliente llegó desde un anuncio de Instagram/Facebook${desc}. Orientá la respuesta a ese producto.] `;
        // Solo el PRIMER mensaje del anuncio trae este contexto; lo prefijamos al texto
        // que lee el cerebro (si no hay texto, le damos una apertura natural).
        texto = ctxAnuncio + (texto || (tieneFoto ? "" : "Hola, vengo del anuncio y quiero más información."));
      }

      // Guardamos nombre y teléfono del cliente para los avisos al equipo (link a la conversación).
      const telCliente = telDeMsg(msg, jid);
      contactoCliente.set(jid, { nombre: msg.pushName || "", tel: telCliente });
      // JID al que vamos a responder (mapea @lid → número real; clave del fix de anuncios).
      const jidEnvio = jidParaResponder(msg, jid);
      jidEnvioDe.set(jid, jidEnvio);
      if (jidEnvio !== jid) console.log(`↪ respondo al número real ${jidEnvio} (entró como ${jid})`);
      // Diagnóstico (lo lee /api/diag): registramos TODO mensaje entrante con su forma.
      diag("recibido", {
        jid, jidEnvio, anuncio: anuncio ? (anuncio.fuente || anuncio.titulo || "sí") : null,
        tieneTexto: !!texto, tieneFoto, esAudio,
        esLid: String(jid).includes("@lid"), tel: telCliente || "",
        formato: Object.keys(contenidoReal(msg.message)).join(",") || "vacío",
      });
      // Diagnóstico: si NO pudimos sacar el teléfono, mostramos los campos de la key
      // para saber de dónde tomarlo (chats @lid del nuevo direccionamiento de WhatsApp).
      if (!telCliente) {
        console.log("⚠ sin teléfono para el link. key:", JSON.stringify({
          remoteJid: msg.key?.remoteJid, remoteJidAlt: msg.key?.remoteJidAlt,
          senderPn: msg.key?.senderPn, participant: msg.key?.participant, participantPn: msg.key?.participantPn,
        }));
      }

      // ¿Un asesor se hizo cargo de esta conversación? Max no participa más acá,
      // pero guarda el mensaje en memoria por si el equipo quiere devolverla luego.
      if (esHumano(jid)) {
        diag("pausado_humano", { jid, anuncio: !!anuncio });
        agregar(jid, "user", texto || (esAudio ? "[el cliente mandó un audio]" : "[el cliente mandó una foto]"));
        console.log(`🤫 conversación de un asesor en ${jid}: Max no participa`);
        continue;
      }

      // MENSAJE SIN TEXTO NI FOTO. Si es AUDIO/nota de voz, no lo descartamos en
      // silencio: le pedimos al cliente que lo escriba (Max no procesa audios).
      // Otros (stickers, etc.) se ignoran.
      if (!texto && !tieneFoto) {
        if (esAudio) {
          try {
            const aviso = "¡Hola! Por ahora no puedo escuchar audios 🙏 ¿Me lo podés escribir en un mensajito? Así te ayudo enseguida.";
            await sock.sendPresenceUpdate("composing", jidEnvio);
            await sleep(900);
            await sock.sendPresenceUpdate("paused", jidEnvio);
            marcarEnviado(await sock.sendMessage(jidEnvio, { text: aviso }));
            registrarMensajeMax(jid); // métrica: Max respondió (al audio)
            agregar(jid, "user", "[el cliente mandó un audio]");
            agregar(jid, "assistant", aviso);
            console.log(`🎤 ${jid}: audio → le pedí que lo escriba`);
          } catch (e) { console.log("⚠ no pude responder al audio:", e.message); }
        } else {
          // Mensaje entrante SIN contenido legible (formato vacío / tipo no soportado).
          // Suele ser un PRIMER mensaje de un contacto nuevo que WhatsApp no pudo
          // descifrar (típico de leads de anuncios): sabemos que escribió pero no
          // podemos leer qué. Antes lo ignorábamos en silencio y se perdía el lead.
          // Ahora le mandamos UN saludo para reenganchar la charla, pero como mucho
          // una vez cada 10 min por chat (anti-spam, por si llegan varios vacíos seguidos).
          const formato = Object.keys(contenidoReal(msg.message)).join(",") || "vacío";
          const ahora = Date.now();
          const ultimoAviso = vaciosAvisados.get(jid) || 0;
          if (ahora - ultimoAviso > 10 * 60 * 1000) {
            vaciosAvisados.set(jid, ahora);
            if (vaciosAvisados.size > 2000) vaciosAvisados.clear(); // tope simple de memoria
            try {
              const aviso = "¡Hola! 🙌 No me llegó bien tu mensaje. ¿Me lo reenviás o me contás qué estás buscando? Así te ayudo enseguida.";
              await sock.sendPresenceUpdate("composing", jidEnvio);
              await sleep(900);
              await sock.sendPresenceUpdate("paused", jidEnvio);
              marcarEnviado(await sock.sendMessage(jidEnvio, { text: aviso }));
              registrarMensajeMax(jid); // métrica: Max respondió
              agregar(jid, "assistant", aviso);
              diag("respondido", { jid, jidEnvio, resumen: "(saludo por mensaje no legible)" });
              console.log(`✉️ ${jid}: mensaje no legible (${formato}) → le mandé un saludo para reenganchar`);
            } catch (e) { console.log("⚠ no pude responder al mensaje vacío:", e.message); }
          } else {
            diag("ignorado_sin_texto", { jid, anuncio: !!anuncio, formato, nota: "ya saludé hace poco" });
            console.log(`(ignorado ${jid}: vacío repetido — ya le saludé hace menos de 10 min)`);
          }
        }
        continue;
      }

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
