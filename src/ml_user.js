// Token de USUARIO de Mercado Libre (cuenta EVERBOX), necesario para ESCRIBIR
// en ML (bajar stock al vender en la web o por Max). El token de aplicación
// (client_credentials, sync_ml.js) solo sirve para leer.
//
// Flujo: Pablo entra UNA vez a /api/ml/conectar (logueado como EVERBOX) →
// ML redirige a la raíz con ?code= → guardamos access+refresh token en Neon
// (sobrevive deploys) y lo renovamos solos. El refresh token de ML es de un
// solo uso: cada renovación entrega uno nuevo y hay que guardarlo.
import "./env.js";
import { neon } from "@neondatabase/serverless";

const API = "https://api.mercadolibre.com";
// Conexión perezosa: sin DATABASE_URL (ej: simulador local) el módulo carga
// igual y recién falla si algo intenta usar la base.
let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

// La redirect_uri debe coincidir EXACTO con la callback de la app
// ("https://max-tester.onrender.com/", con barra final).
const REDIRECT = `${(process.env.APP_URL || "https://max-tester.onrender.com").replace(/\/$/, "")}/`;

let _mem = null; // caché en memoria del registro de Neon

async function prepararTabla() {
  await sql`create table if not exists ml_user_token (
    id int primary key,
    access_token text not null,
    refresh_token text,
    expires_at bigint not null,
    ml_user_id text,
    updated_at timestamptz default now()
  )`;
}

async function cargar() {
  if (_mem) return _mem;
  await prepararTabla();
  const rows = await sql`select * from ml_user_token where id = 1`;
  _mem = rows[0] || null;
  return _mem;
}

async function guardar(t) {
  await prepararTabla();
  _mem = t;
  await sql`insert into ml_user_token (id, access_token, refresh_token, expires_at, ml_user_id)
    values (1, ${t.access_token}, ${t.refresh_token}, ${t.expires_at}, ${t.ml_user_id})
    on conflict (id) do update set access_token = ${t.access_token}, refresh_token = ${t.refresh_token},
      expires_at = ${t.expires_at}, ml_user_id = ${t.ml_user_id}, updated_at = now()`;
}

async function pedirToken(params) {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      ...params,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`oauth ML: ${body.message || body.error_description || body.error || res.status}`);
  }
  return body;
}

function aRegistro(body) {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || null,
    // 5 min de margen antes del vencimiento real (6 h)
    expires_at: Date.now() + Math.max(60, (body.expires_in || 21600) - 300) * 1000,
    ml_user_id: body.user_id ? String(body.user_id) : null,
  };
}

/** URL a la que tiene que entrar Pablo (logueado como EVERBOX) para autorizar. */
export function urlAutorizacion() {
  return (
    `https://auth.mercadolibre.com.uy/authorization?response_type=code` +
    `&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}`
  );
}

/** Canjea el ?code= del retorno de ML y guarda los tokens. */
export async function conectarConCode(code) {
  if (!code) throw new Error("falta el código de autorización");
  const body = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: REDIRECT });
  const reg = aRegistro(body);
  await guardar(reg);
  console.log(`🔗 Cuenta ML conectada: usuario ${reg.ml_user_id} (refresh: ${reg.refresh_token ? "sí" : "NO"})`);
  return { usuario: reg.ml_user_id, conRefresh: !!reg.refresh_token };
}

/** Access token vigente del usuario (renueva solo si venció). null si no hay autorización. */
export async function tokenUsuario() {
  const t = await cargar();
  if (!t) return null;
  if (Date.now() < Number(t.expires_at)) return t.access_token;
  if (!t.refresh_token) return null; // venció y no hay cómo renovar: re-autorizar
  const body = await pedirToken({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  const reg = aRegistro(body);
  if (!reg.refresh_token) reg.refresh_token = t.refresh_token; // por las dudas, conservar el viejo
  if (!reg.ml_user_id) reg.ml_user_id = t.ml_user_id;
  await guardar(reg);
  return reg.access_token;
}

/** ¿Hay cuenta de ML autorizada? (para /api/estado) */
export async function hayUsuarioML() {
  try {
    return !!(await cargar());
  } catch {
    return false;
  }
}
