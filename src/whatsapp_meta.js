// Transporte de WhatsApp por la CLOUD API OFICIAL de Meta (reemplazo de Baileys).
// En vez de un socket con QR, Meta nos manda los mensajes entrantes a un WEBHOOK
// (POST /webhook) y nosotros respondemos por HTTP (meta_api.js). El CEREBRO de Max
// (handler.js → cerebro.js) es el MISMO: este archivo es solo la cañería nueva.
//
// Se monta sobre el server web (web.js) con montarWebhook(app), solo cuando
// WA_PROVIDER=meta. Mientras tanto, Baileys (whatsapp.js) sigue funcionando igual.
//
// Ventajas vs Baileys: no se cae, no hay QR, los clics de anuncios llegan nativos
// (con su `referral`, sin el parche del @lid) y se puede hacer broadcast legal.
import "./env.js";
import { procesarMensaje } from "./handler.js";
import { sleep, delayEscritura } from "./humano.js";
import { agregar, cargarConversaciones } from "./memoria.js";
import { registrarMensajeMax } from "./metricas.js";
import { linkTurno } from "./confirmacion_turno.js";
import { cargarEstado, esHumano, marcarHumano } from "./previas.js";
import { registrarTransporte, enviarTexto, linkWa } from "./notificador.js";
import { registrarCliente } from "./clientes.js";
import { diag } from "./diag.js";
import {
  enviarTextoMeta, enviarImagenMeta, marcarLeidoEscribiendo,
  mediaComoDataUri, aWaId, metaConfigurado,
} from "./meta_api.js";

const VENTANA_MS = 3500; // junta mensajes seguidos del cliente y responde UNA vez
const buffers = new Map(); // tel -> { textos:[], imagenes:[], timer, contacto, ctxAnuncio }
const procesando = new Set();
const idsVistos = new Set(); // anti-duplicados (Meta puede reentregar el webhook)
const enviadosPorMax = new Set(); // ids de mensajes que mandó Max (para no confundir el eco en coexistence)
const pedidosAvisados = new Set();
const turnosAvisados = new Set();

// Número propio (el 091 dentro de la WABA): en coexistence, los mensajes que el
// equipo manda desde la app del celular también llegan al webhook con from = este
// número. Los usamos para pausar a Max (handoff humano).
function numeroPropio() {
  return aWaId(process.env.NUMERO_BOT || process.env.NUMERO_AVISOS || "");
}

function marcarEnviado(resp) {
  const id = resp?.messages?.[0]?.id;
  if (!id) return;
  enviadosPorMax.add(id);
  if (enviadosPorMax.size > 500) {
    for (const v of enviadosPorMax) { enviadosPorMax.delete(v); if (enviadosPorMax.size <= 500) break; }
  }
}

// COEXISTENCE (número en la app del celular Y en la Cloud API a la vez):
// cuando un asesor responde a un cliente DESDE la app de WhatsApp Business, Meta
// nos avisa por el webhook `smb_message_echoes` → value.message_echoes[], con el
// cliente en el campo `to`. Ese es el handoff: pausamos a Max en ese chat 3 h para
// que no hable encima del asesor. (En "API pura", sin app, esto nunca dispara.)
// REQUISITO Meta: suscribir el campo `smb_message_echoes` en el panel de la app.
async function procesarEcoEquipo(echo) {
  const id = echo?.id;
  if (id) {
    if (idsVistos.has(id)) return;          // anti-duplicado (Meta reentrega)
    idsVistos.add(id);
    if (idsVistos.size > 4000) idsVistos.clear();
    if (enviadosPorMax.has(id)) return;     // por las dudas: no es un envío de Max por la API
  }
  // La sincronización de historial de Coexistence también entrega ECOS VIEJOS del
  // equipo (meses de respuestas desde la app). Solo un eco RECIENTE significa "un
  // asesor está atendiendo AHORA": los históricos no deben pausar a Max.
  const ts = parseInt(echo?.timestamp || "0", 10);
  if (ts && Date.now() / 1000 - ts > 600) return;
  const cliente = aWaId(echo?.to);          // a QUIÉN le escribió el asesor
  if (!cliente) return;
  await marcarHumano(cliente);              // Max se calla 3 h en ese chat
  const t = echo?.text?.body || (echo?.type ? `[${echo.type}]` : "[mensaje]");
  agregar(cliente, "assistant", t);         // guardar en el historial lo que escribió el asesor
  diag("handoff_equipo", { jid: cliente });
  console.log(`🧑 el equipo respondió a ${cliente} desde la app → Max en pausa 3 h`);
}

function encolar(tel, { texto, imagenes = [], contacto, msgId }) {
  const b = buffers.get(tel) || { textos: [], imagenes: [], timer: null, contacto: {}, msgId: null };
  if (texto) b.textos.push(texto);
  if (imagenes.length) b.imagenes.push(...imagenes);
  if (contacto) b.contacto = { ...b.contacto, ...contacto };
  if (msgId) b.msgId = msgId;
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => { b.timer = null; procesar(tel); }, VENTANA_MS);
  buffers.set(tel, b);
}

async function procesar(tel) {
  if (procesando.has(tel)) return;
  const b = buffers.get(tel);
  if (!b || (!b.textos.length && !b.imagenes.length)) return;

  const texto = b.textos.join("\n");
  const imagenes = b.imagenes;
  const contacto = b.contacto || {};
  const msgId = b.msgId;
  b.textos = []; b.imagenes = [];
  procesando.add(tel);
  try {
    await marcarLeidoEscribiendo(msgId); // ✓✓ leído + "escribiendo…"
    const { texto: respuesta, acciones, imagenesEnviar = [] } =
      await procesarMensaje({ chatId: tel, texto, canal: "whatsapp", imagenes, contacto });

    // Si el cliente escribió MÁS mientras Max pensaba, reprocesamos con eso incluido.
    if (b.textos.length || b.imagenes.length) { procesando.delete(tel); return procesar(tel); }

    await sleep(delayEscritura(respuesta));
    marcarEnviado(await enviarTextoMeta(tel, respuesta));
    registrarMensajeMax(tel);

    for (const f of imagenesEnviar) {
      try {
        await sleep(900 + Math.floor(Math.random() * 900));
        marcarEnviado(await enviarImagenMeta(tel, f.url, f.caption || ""));
      } catch (e) { console.log("⚠ no pude enviar foto:", e.message); }
    }
    diag("respondido", { jid: tel, resumen: String(respuesta).slice(0, 80) });
    console.log(`📤 ${tel}: ${respuesta}` + (imagenesEnviar.length ? ` (+${imagenesEnviar.length} foto)` : ""));

    await avisarAcciones(acciones, contacto);
  } catch (e) {
    diag("error", { jid: tel, detalle: e.message });
    console.log(`⚠ Error respondiendo a ${tel}: ${e.message}`);
    try { marcarEnviado(await enviarTextoMeta(tel, "¡Perdón! Se me cruzó un cable 😅 ¿Me lo repetís?")); } catch {}
  } finally {
    procesando.delete(tel);
    const b2 = buffers.get(tel);
    if (b2 && (b2.textos.length || b2.imagenes.length)) procesar(tel);
  }
}

// Avisos al equipo (derivación / venta / turno). Mismo contenido que en Baileys;
// se mandan por el transporte registrado (Meta) a NUMERO_AVISOS. Ver nota de las
// 24 h en META_SETUP.md: el número de avisos debe ser de un asesor (no el del bot).
async function avisarAcciones(acciones, contacto) {
  const lineaCliente = contacto.nombre ? `👤 ${contacto.nombre}` : "";
  const linkConversacion = linkWa(contacto.tel) ? `👉 ${linkWa(contacto.tel)}` : "Buscá la conversación en la bandeja de Meta Business Suite.";

  for (const a of acciones) {
    try {
      if (a.herramienta === "derivar_a_humano") {
        const d = a.resultado?.derivacion || a.input || {};
        const link = linkWa(d.telefono) ? `👉 ${linkWa(d.telefono)}` : linkConversacion;
        const lineas = d.motivo === "pide_humano"
          ? ["🙋 UN CLIENTE PIDE HABLAR CON UN ASESOR", d.resumen ? `📝 ${d.resumen}` : "", lineaCliente, `💬 Entrá a la conversación: ${link}`]
          : ["❓ MAX NO PUDO RESOLVER — necesita un asesor", `Motivo: ${d.motivo || "otro"}${d.resumen ? ` · ${d.resumen}` : ""}`, lineaCliente, `💬 Entrá a la conversación: ${link}`];
        await enviarTexto(lineas.filter(Boolean).join("\n"));
      } else if (a.herramienta === "tomar_pedido") {
        const p = a.resultado?.pedido;
        if (!p || pedidosAvisados.has(p.id)) continue;
        pedidosAvisados.add(p.id);
        const lineas = [
          "🛒 NUEVA VENTA — Max cerró un pedido",
          `Producto: ${p.producto || "?"}${p.modeloVehiculo ? ` · ${p.modeloVehiculo}` : ""}`,
          p.medioPago ? `💳 Pago: ${p.medioPago}` : "",
          lineaCliente || ([p.nombre, p.telefono].filter(Boolean).length ? `👤 ${[p.nombre, p.telefono].filter(Boolean).join(" · ")}` : ""),
          p.notas ? `📝 ${p.notas}` : "",
          `💬 Verificá el pago y coordiná la entrega: ${linkConversacion}`,
        ].filter(Boolean);
        await enviarTexto(lineas.join("\n"));
      } else if (a.herramienta === "solicitar_turno") {
        const tr = a.resultado?.turno;
        if (!tr || turnosAvisados.has(tr.id)) continue;
        turnosAvisados.add(tr.id);
        const cuando = [tr.fecha, tr.hora].filter(Boolean).join(" ");
        const lineas = [
          "🗓️ SOLICITUD DE TURNO — confirmá el día y la hora con el cliente",
          `👤 ${[tr.nombre, tr.telefono].filter(Boolean).join(" · ") || "(sin datos)"}`,
          tr.servicio ? `🔧 ${tr.servicio}` : "",
          tr.vehiculo ? `🚗 ${tr.vehiculo}` : "",
          cuando ? `📅 Prefiere: ${cuando}` : "📅 Sin preferencia de horario",
          `💬 Entrá a la conversación: ${linkConversacion}`,
          `✅ Confirmá: ${linkTurno(tr.id, "confirmado")}`,
          `❌ Cancelar: ${linkTurno(tr.id, "cancelado")}`,
        ].filter(Boolean);
        await enviarTexto(lineas.join("\n"));
      }
    } catch (e) {
      console.log(`⚠ no pude avisar al equipo (${a.herramienta}): ${e.message}`);
    }
  }
}

// ── Parseo del webhook entrante de Meta ───────────────────────────────────────
// Extrae el contexto de un anuncio Click-to-WhatsApp (referral). Reemplaza todo el
// parche del @lid de Baileys: acá viene limpio en el primer mensaje del anuncio.
function ctxDeAnuncio(referral) {
  if (!referral) return null;
  const partes = [];
  if (referral.headline) partes.push(`sobre "${referral.headline}"`);
  if (referral.body) partes.push(`— ${referral.body}`);
  const desc = partes.length ? ` ${partes.join(" ")}` : "";
  return {
    titulo: referral.headline || "",
    fuente: referral.source_type || "",
    ctx: `[Contexto: el cliente llegó desde un anuncio de Instagram/Facebook${desc}. Orientá la respuesta a ese producto.] `,
  };
}

// Procesa UN mensaje entrante del webhook (objeto value.messages[i]).
async function procesarEntrante(msg, value) {
  const tel = aWaId(msg.from);
  const propio = numeroPropio();

  // Anti-duplicados: Meta puede reintentar el webhook.
  if (msg.id) {
    if (idsVistos.has(msg.id)) return;
    idsVistos.add(msg.id);
    if (idsVistos.size > 4000) idsVistos.clear();
  }

  // COEXISTENCE: la sincronización de historial (hasta 6 meses) puede entregar
  // mensajes VIEJOS por el webhook como si fueran nuevos. Igual que hacía Baileys
  // con arranqueTs, todo lo que tenga más de 10 minutos se ignora: responder
  // charlas de hace días/semanas confundiría a los clientes.
  const ts = parseInt(msg.timestamp || "0", 10);
  if (ts && Date.now() / 1000 - ts > 600) {
    diag("ignorado_viejo", { jid: tel, ts });
    console.log(`🕰️ ${tel}: mensaje viejo (sync de historial), ignorado`);
    return;
  }

  // COEXISTENCE: un mensaje con from = nuestro propio número es el EQUIPO escribiendo
  // desde la app del celular. Si no lo mandó Max por la API, es un humano → handoff.
  if (propio && tel === propio) {
    if (msg.id && enviadosPorMax.has(msg.id)) return; // eco de un envío de Max
    // El destinatario (cliente) en el eco viene en distintos campos según el caso;
    // si no lo tenemos, no podemos atar el handoff a una conversación: lo logueamos.
    console.log("🧑 mensaje del equipo desde la app (coexistence) — handoff");
    return;
  }

  // Nombre del cliente (viene en value.contacts).
  const perfil = (value.contacts || []).find((c) => aWaId(c.wa_id) === tel);
  const nombre = perfil?.profile?.name || "";

  // ¿Vino desde un anuncio? (primer mensaje del Click-to-WhatsApp)
  const anuncio = ctxDeAnuncio(msg.referral);
  if (anuncio) console.log(`📣 ${tel}: desde ANUNCIO${anuncio.titulo ? ` ("${anuncio.titulo}")` : ""}`);

  // Registrar/actualizar el cliente en nuestra base propia (agenda + segmentación).
  registrarCliente({ telefono: tel, nombre, origen: anuncio ? (anuncio.titulo || anuncio.fuente || "anuncio") : "" });

  // ¿Un asesor ya tomó esta conversación? Max no participa, pero guarda en memoria.
  if (esHumano(tel)) {
    const t = msg.text?.body || (msg.type === "audio" ? "[audio]" : msg.type === "image" ? "[foto]" : "[mensaje]");
    agregar(tel, "user", t);
    diag("pausado_humano", { jid: tel, anuncio: !!anuncio });
    console.log(`🤫 conversación de un asesor en ${tel}: Max no participa`);
    return;
  }

  const contacto = { nombre, tel };

  // ── Según el tipo de mensaje ──
  if (msg.type === "text") {
    let texto = msg.text?.body || "";
    if (anuncio) texto = anuncio.ctx + (texto || "Hola, vengo del anuncio y quiero más información.");
    diag("recibido", { jid: tel, anuncio: anuncio ? (anuncio.fuente || anuncio.titulo || "sí") : null, tieneTexto: !!texto, tieneFoto: false, tel });
    console.log(`📩 ${tel}: ${texto}`);
    encolar(tel, { texto, contacto, msgId: msg.id });
    return;
  }

  if (msg.type === "image") {
    const dataUri = msg.image?.id ? await mediaComoDataUri(msg.image.id) : null;
    let texto = msg.image?.caption || "";
    if (anuncio) texto = anuncio.ctx + texto;
    diag("recibido", { jid: tel, anuncio: !!anuncio, tieneTexto: !!texto, tieneFoto: true, tel });
    console.log(`📩 ${tel}: [foto]${texto ? " " + texto : ""}`);
    encolar(tel, { texto, imagenes: dataUri ? [dataUri] : [], contacto, msgId: msg.id });
    return;
  }

  if (msg.type === "audio") {
    // Max no procesa audios: pedimos que lo escriban (igual que en Baileys).
    try {
      await marcarLeidoEscribiendo(msg.id);
      const aviso = "¡Hola! Por ahora no puedo escuchar audios 🙏 ¿Me lo podés escribir en un mensajito? Así te ayudo enseguida.";
      await sleep(800);
      marcarEnviado(await enviarTextoMeta(tel, aviso));
      registrarMensajeMax(tel);
      agregar(tel, "user", "[el cliente mandó un audio]");
      agregar(tel, "assistant", aviso);
      console.log(`🎤 ${tel}: audio → le pedí que lo escriba`);
    } catch (e) { console.log("⚠ no pude responder al audio:", e.message); }
    return;
  }

  // Otros tipos (sticker, ubicación, contacto, etc.): si vino de un anuncio sin
  // cuerpo, lo tratamos como apertura; si no, lo ignoramos en silencio.
  if (anuncio) {
    encolar(tel, { texto: anuncio.ctx + "Hola, vengo del anuncio y quiero más información.", contacto, msgId: msg.id });
  } else {
    diag("ignorado_sin_texto", { jid: tel, formato: msg.type || "?" });
    console.log(`(ignorado ${tel}: tipo ${msg.type})`);
  }
}

// ── Montaje del webhook sobre el server express (web.js) ──────────────────────
export function montarWebhook(app) {
  if (!metaConfigurado()) {
    console.log("⚠ WA_PROVIDER=meta pero faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_ID — el webhook NO se monta.");
    return;
  }

  // Cargar estado (handoff) y memoria (igual que hace Baileys al arrancar).
  cargarEstado();
  cargarConversaciones();

  // Avisos al equipo (derivación/venta/turno) salen por la Cloud API.
  registrarTransporte(async (texto) => {
    const destino = process.env.NUMERO_AVISOS || "091629784";
    await enviarTextoMeta(destino, texto);
  });

  // 1) VERIFICACIÓN del webhook (Meta hace un GET cuando lo configurás).
  app.get("/webhook", (req, res) => {
    const modo = req.query["hub.mode"];
    const tokenRecibido = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (modo === "subscribe" && tokenRecibido === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log("✅ webhook de Meta verificado");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // 2) RECEPCIÓN de mensajes. Respondemos 200 ENSEGUIDA (Meta reintenta si tardamos)
  //    y procesamos en segundo plano.
  app.post("/webhook", (req, res) => {
    res.sendStatus(200);
    try {
      const entradas = req.body?.entry || [];
      for (const entry of entradas) {
        for (const ch of entry.changes || []) {
          const value = ch.value || {};
          // messages = mensajes de clientes → los atiende Max.
          for (const msg of value.messages || []) {
            procesarEntrante(msg, value).catch((e) => console.log("⚠ error procesando entrante:", e.message));
          }
          // message_echoes (smb_message_echoes) = el equipo respondió desde la app → handoff.
          for (const eco of value.message_echoes || []) {
            procesarEcoEquipo(eco).catch((e) => console.log("⚠ error procesando eco:", e.message));
          }
          // statuses = recibos de entrega/lectura: se ignoran solos.
        }
      }
    } catch (e) {
      console.log("⚠ webhook: body inesperado:", e.message);
    }
  });

  console.log("🟢 WhatsApp Cloud API (Meta) montado en /webhook — Max atiende por la API oficial.");
}
