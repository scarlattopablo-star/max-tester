// APRENDIZAJE de Max: cada día analiza las conversaciones reales con Gemini (capa
// gratuita) y destila LECCIONES concretas para mejorar el trato y la forma de
// transmitir la información, SIN dejar de ser formal y correcto. Esas lecciones se
// inyectan en el prompt de Max (cerebro.js → leccionesActuales()) y se guardan en
// Neon (tabla `aprendizaje`) para tener el historial. Todo gratis: Neon + Gemini
// free tier + el propio proceso de Render (sin servicios extra).
import "./env.js";
import { neon } from "@neondatabase/serverless";
import { conversacionesEntre } from "./memoria.js";

const usaDB = !!process.env.DATABASE_URL;
let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

let _lecciones = "";        // texto de las lecciones vigentes (en memoria, va al prompt)
let _ultimoAnalisisMs = 0;  // cuándo corrió el último análisis
let _ultimoResultado = null; // {ok, cant, cuando, motivo?} del último intento

const DIA_MS = 24 * 60 * 60 * 1000;

export function leccionesActuales() { return _lecciones; }
export function estadoAprendizaje() {
  return { tieneLecciones: !!_lecciones, ultimoAnalisis: _ultimoAnalisisMs ? new Date(_ultimoAnalisisMs).toISOString() : null, ultimoResultado: _ultimoResultado, lecciones: _lecciones };
}

async function prepararTabla() {
  await sql`create table if not exists aprendizaje (
    id serial primary key,
    lecciones text not null,
    cant_conversaciones int default 0,
    creado timestamptz default now()
  )`;
}

/** Carga las últimas lecciones guardadas. Llamar al iniciar. */
export async function cargarLecciones() {
  if (!usaDB) return;
  try {
    await prepararTabla();
    const r = await sql`select lecciones, extract(epoch from creado) * 1000 as ms from aprendizaje order by creado desc limit 1`;
    if (r.length) { _lecciones = r[0].lecciones || ""; _ultimoAnalisisMs = Number(r[0].ms) || 0; }
    console.log(_lecciones ? `🎓 lecciones de aprendizaje cargadas (último: ${new Date(_ultimoAnalisisMs).toISOString()})` : "🎓 todavía no hay lecciones de aprendizaje");
  } catch (e) {
    console.log("⚠ no pude cargar las lecciones:", e.message);
  }
}

// Llama a Gemini (capa gratuita) y devuelve el texto de la respuesta.
// Pide el análisis a una IA GRATIS. Prefiere Groq (free tier global, sin
// restricción de región); si no hay, usa Gemini. Ambos opcionales.
async function pedirAnalisis(prompt) {
  if (process.env.GROQ_API_KEY) return pedirAGroq(prompt);
  if (process.env.GEMINI_API_KEY) return pedirAGemini(prompt);
  throw new Error("falta una API key gratuita (GROQ_API_KEY o GEMINI_API_KEY) en el entorno; cargala en Render");
}

async function pedirAGroq(prompt) {
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}

async function pedirAGemini(prompt) {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "").trim();
}

function construirPrompt(convs) {
  const muestras = convs.slice(0, 40).map((c, i) => {
    const t = c.mensajes
      .map((m) => `${m.role === "user" ? "Cliente" : "Max"}: ${String(m.content || "").split("⁣")[0]}`)
      .join("\n");
    return `--- Conversación ${i + 1} ---\n${t}`;
  }).join("\n\n");

  return `Sos un analista de calidad de atención al cliente de "La Casa del Cubreasiento" (tienda de accesorios para autos, Montevideo, Uruguay). El asistente de WhatsApp se llama Max: trato formal y de usted, sin emojis, cálido y humano, mensajes cortos, asesora y vende cubreasientos/alfombras/cubre volante/accesorios.

Te paso conversaciones REALES recientes. Analizalas para encontrar cómo Max puede MEJORAR el trato al cliente y la forma de transmitir la información: dónde el cliente se confunde o se frustra, qué dudas se repiten, qué hace que una venta avance o se caiga, dónde Max suena repetitivo o robótico, qué información conviene dar antes o de otra manera. Max debe seguir siendo correcto y formal.

Devolvé EXCLUSIVAMENTE entre 3 y 6 LECCIONES concretas y accionables, en español, cada una en una viñeta que empiece con "- ". Que sean instrucciones claras y aplicables (ej: "- Cuando preguntan por colocación de alfombras, aclarar de entrada que no se colocan, antes de hablar de precio."). Nada de encabezados ni explicaciones: SOLO las viñetas.

CONVERSACIONES:
${muestras}`;
}

/** Corre el análisis AHORA: lee las conversaciones de las últimas 24 h, pide
 *  lecciones a Gemini, las guarda y las deja vigentes. Devuelve un resumen. */
export async function analizarAhora() {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - DIA_MS);
  const convs = (await conversacionesEntre(desde.toISOString(), hasta.toISOString()))
    .filter((c) => Array.isArray(c.mensajes) && c.mensajes.length >= 2);

  if (!convs.length) {
    _ultimoResultado = { ok: false, motivo: "sin conversaciones para analizar", cuando: hasta.toISOString() };
    _ultimoAnalisisMs = hasta.getTime(); // marca que ya "corrió" hoy aunque no haya datos
    console.log("🎓 aprendizaje: no hay conversaciones nuevas para analizar");
    return _ultimoResultado;
  }

  try {
    const lecciones = await pedirAnalisis(construirPrompt(convs));
    if (!lecciones) throw new Error("Gemini no devolvió lecciones");
    _lecciones = lecciones;
    _ultimoAnalisisMs = hasta.getTime();
    if (usaDB) {
      await prepararTabla();
      await sql`insert into aprendizaje (lecciones, cant_conversaciones) values (${lecciones}, ${convs.length})`;
    }
    _ultimoResultado = { ok: true, cant: convs.length, cuando: hasta.toISOString() };
    console.log(`🎓 aprendizaje: ${convs.length} conversaciones analizadas, lecciones actualizadas`);
    return _ultimoResultado;
  } catch (e) {
    _ultimoResultado = { ok: false, motivo: String(e.message || e), cuando: hasta.toISOString() };
    console.log("⚠ aprendizaje falló:", e.message);
    return _ultimoResultado;
  }
}

/** Programa el análisis diario. Revisa cada hora; corre si pasó ~1 día del último.
 *  Robusto a reinicios (el último análisis se guarda en la base). */
export function programarAprendizaje() {
  if (!usaDB) return;
  const tick = async () => {
    try {
      if (Date.now() - _ultimoAnalisisMs >= DIA_MS) await analizarAhora();
    } catch (e) { console.log("⚠ tick de aprendizaje:", e.message); }
  };
  // Primer chequeo 10 min después de arrancar (deja que cargue todo), luego cada hora.
  setTimeout(tick, 10 * 60 * 1000);
  setInterval(tick, 60 * 60 * 1000);
}
