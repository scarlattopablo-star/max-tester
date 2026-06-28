// Base de datos de CLIENTES (tabla `clientes` en Neon). Cada persona que le escribe
// a Max queda registrada acá: teléfono, nombre, cuándo nos escribió por primera y
// última vez, cuántos mensajes mandó, qué modelo de auto mencionó, de qué anuncio
// vino y si aceptó recibir promos (opt-in). Sirve para:
//   1) tener una agenda propia de clientes (la consultás en /admin),
//   2) segmentar (ej: "todos los que preguntaron por Hilux"),
//   3) mandar promos por WhatsApp con PLANTILLAS aprobadas (broadcast), legal y
//      sin riesgo de baneo (a diferencia de Baileys).
//
// Reglas de Meta para escribir FUERA de las 24 h (lo aplica enviarPromo):
//   - solo a clientes con opt_in = true,
//   - solo con PLANTILLA aprobada (no texto libre),
//   - se cobra por conversación de marketing.
import "./env.js";
import { neon } from "@neondatabase/serverless";
import { enviarPlantillaMeta, aWaId } from "./meta_api.js";

const usaDB = !!process.env.DATABASE_URL;
let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

let listo = false;
async function asegurarTabla() {
  if (listo || !usaDB) return;
  await sql`create table if not exists clientes (
    telefono text primary key,
    nombre text default '',
    primer_contacto timestamptz default now(),
    ultimo_contacto timestamptz default now(),
    mensajes int default 0,
    modelo_vehiculo text default '',
    origen text default '',
    etiquetas jsonb default '[]',
    opt_in boolean default true,
    notas text default ''
  )`;
  listo = true;
}

// Registra/actualiza un cliente cada vez que escribe. Idempotente y tolerante a
// fallos (nunca debe romper la atención si la base falla). `origen` es el anuncio
// de donde vino (si aplica). El opt_in arranca en true: el cliente nos escribió
// primero, lo que cuenta como interés; igual conviene confirmarlo (ver META_SETUP).
export async function registrarCliente({ telefono, nombre = "", origen = "", modeloVehiculo = "" }) {
  if (!usaDB) return;
  const tel = aWaId(telefono);
  if (!tel) return;
  try {
    await asegurarTabla();
    await sql`
      insert into clientes (telefono, nombre, origen, modelo_vehiculo, mensajes, primer_contacto, ultimo_contacto)
      values (${tel}, ${nombre}, ${origen}, ${modeloVehiculo}, 1, now(), now())
      on conflict (telefono) do update set
        nombre = case when clientes.nombre = '' then excluded.nombre else clientes.nombre end,
        modelo_vehiculo = case when excluded.modelo_vehiculo <> '' then excluded.modelo_vehiculo else clientes.modelo_vehiculo end,
        origen = case when clientes.origen = '' then excluded.origen else clientes.origen end,
        mensajes = clientes.mensajes + 1,
        ultimo_contacto = now()`;
  } catch (e) {
    console.log("⚠ no pude registrar el cliente:", e.message);
  }
}

// Marca/actualiza una etiqueta de interés (ej: "hilux", "carrito", "cubreasiento")
// para poder segmentar después. Sin duplicar.
export async function etiquetar(telefono, etiqueta) {
  if (!usaDB || !etiqueta) return;
  const tel = aWaId(telefono);
  if (!tel) return;
  try {
    await asegurarTabla();
    await sql`update clientes
      set etiquetas = (select jsonb_agg(distinct e) from jsonb_array_elements(etiquetas || ${JSON.stringify([etiqueta])}::jsonb) e)
      where telefono = ${tel}`;
  } catch (e) {
    console.log("⚠ no pude etiquetar al cliente:", e.message);
  }
}

// Cambia el consentimiento de promos (si un cliente pide no recibir más).
export async function setOptIn(telefono, valor) {
  if (!usaDB) return;
  const tel = aWaId(telefono);
  try { await asegurarTabla(); await sql`update clientes set opt_in = ${!!valor} where telefono = ${tel}`; }
  catch (e) { console.log("⚠ no pude actualizar opt_in:", e.message); }
}

// Lista de clientes para el panel /admin. Filtros opcionales: etiqueta, soloOptIn.
export async function listarClientes({ etiqueta = "", soloOptIn = false, limite = 500 } = {}) {
  if (!usaDB) return [];
  try {
    await asegurarTabla();
    const lim = Math.min(Math.max(parseInt(limite) || 500, 1), 5000);
    // El driver http de Neon NO compone fragmentos sql anidados: escribimos cada
    // combinación como una consulta completa (igual que el resto del código).
    if (etiqueta && soloOptIn) {
      return await sql`select * from clientes where etiquetas ? ${etiqueta} and opt_in = true order by ultimo_contacto desc limit ${lim}`;
    }
    if (etiqueta) {
      return await sql`select * from clientes where etiquetas ? ${etiqueta} order by ultimo_contacto desc limit ${lim}`;
    }
    if (soloOptIn) {
      return await sql`select * from clientes where opt_in = true order by ultimo_contacto desc limit ${lim}`;
    }
    return await sql`select * from clientes order by ultimo_contacto desc limit ${lim}`;
  } catch (e) {
    console.log("⚠ no pude listar clientes:", e.message);
    return [];
  }
}

export async function totalClientes() {
  if (!usaDB) return 0;
  try { await asegurarTabla(); const r = await sql`select count(*)::int n from clientes`; return r[0]?.n || 0; }
  catch { return 0; }
}

// ── BROADCAST DE PROMOS ───────────────────────────────────────────────────────
// Manda una PLANTILLA aprobada a todos los clientes (o a un segmento por etiqueta),
// respetando el opt_in. `parametros(cliente)` arma los parámetros del cuerpo de la
// plantilla por cada cliente (ej: el nombre). Va de a uno con un respiro para no
// gatillar el rate-limit de Meta. Devuelve un resumen { enviados, fallidos, total }.
//
// IMPORTANTE: la plantilla `nombrePlantilla` debe estar APROBADA en Meta antes de
// usar esto (ver PLANTILLAS_WHATSAPP.md). Probalo primero con `dry: true`.
export async function enviarPromo({ nombrePlantilla, idioma = "es", etiqueta = "", parametros = null, dry = false, pausaMs = 250 } = {}) {
  if (!nombrePlantilla) throw new Error("falta el nombre de la plantilla");
  const clientes = await listarClientes({ etiqueta, soloOptIn: true, limite: 5000 });
  const resumen = { total: clientes.length, enviados: 0, fallidos: 0, errores: [] };
  for (const c of clientes) {
    const componentes = parametros ? parametros(c) : [];
    if (dry) { resumen.enviados++; continue; } // simulación: no manda nada
    try {
      await enviarPlantillaMeta(c.telefono, nombrePlantilla, idioma, componentes);
      resumen.enviados++;
    } catch (e) {
      resumen.fallidos++;
      if (resumen.errores.length < 10) resumen.errores.push({ telefono: c.telefono, error: e.message });
    }
    await new Promise((r) => setTimeout(r, pausaMs));
  }
  return resumen;
}
