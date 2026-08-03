// LISTA DE ESPERA ("avisame cuando llegue").
//
// Cuando un cliente pregunta por un producto que EXISTE en Mercado Libre pero está
// pausado o sin stock, Max ya no lo deriva a un asesor: le dice que se agotó y le
// ofrece avisarle cuando llegue. Si acepta, la espera queda anotada acá.
//
// Cada vez que el catálogo se sincroniza con ML (cada 30 min, ver sync_ml.js), se
// repasan las esperas pendientes: las que ya tienen su publicación activa otra vez
// disparan un WhatsApp al cliente y quedan cerradas. Se avisa UNA sola vez.
//
// ⚠️ El aviso sale días después del último mensaje del cliente, o sea FUERA de la
// ventana de 24 h: Meta exige PLANTILLA aprobada (`volvio_stock_max`). Si la plantilla
// falla, se intenta texto libre (llega solo si la ventana está abierta) y, si tampoco,
// la espera queda PENDIENTE para reintentar en la próxima sincronización.
import "./env.js";
import { neon } from "@neondatabase/serverless";
import { aWaId, enviarPlantillaMeta, enviarTextoMeta, metaConfigurado } from "./meta_api.js";
import { estaDisponible } from "./catalogo_vivo.js";

// Cuánto vive una espera. Pasado ese plazo se vence sola y NO se avisa: si el
// producto tarda medio año en volver, el cliente ya compró en otro lado y el
// mensaje cae mal.
const DIAS_VIGENCIA = 90;

// Plantilla aprobada en Meta. PLANTILLA_STOCK="" la desactiva (queda solo el texto libre).
const PLANTILLA = process.env.PLANTILLA_STOCK ?? "volvio_stock_max";

const usaDB = !!process.env.DATABASE_URL;
let _sql = null;
function sql(strings, ...vals) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...vals);
}

let listo = false;
async function asegurarTabla() {
  if (listo || !usaDB) return;
  await sql`create table if not exists esperas (
    telefono text not null,
    item_id text not null,
    titulo text default '',
    estado text default 'pendiente',
    creada timestamptz default now(),
    avisada_en timestamptz,
    primary key (telefono, item_id)
  )`;
  listo = true;
}

// ¿Se puede usar la lista de espera? Sin base no hay dónde anotar: Max NO tiene que
// prometerle al cliente un aviso que nunca va a llegar.
export function hayEsperas() {
  return usaDB;
}

// Anota (o revive) la espera de un cliente por una publicación concreta de ML.
// Si el mismo cliente ya se había anotado por lo mismo, no se duplica: se reabre.
export async function anotarEspera({ telefono, itemId, titulo = "" }) {
  if (!usaDB) return { ok: false, motivo: "sin_base" };
  const tel = aWaId(telefono);
  const item = String(itemId || "").trim();
  if (!tel || !item) return { ok: false, motivo: "datos_incompletos" };
  try {
    await asegurarTabla();
    await sql`
      insert into esperas (telefono, item_id, titulo, estado, creada)
      values (${tel}, ${item}, ${titulo}, 'pendiente', now())
      on conflict (telefono, item_id) do update set
        estado = 'pendiente',
        creada = now(),
        avisada_en = null,
        titulo = case when excluded.titulo <> '' then excluded.titulo else esperas.titulo end
    `;
    return { ok: true };
  } catch (e) {
    console.error("⚠ No pude anotar la espera:", e.message);
    return { ok: false, motivo: String(e.message || e) };
  }
}

// Esperas vivas (para el repaso y para diagnosticar).
export async function esperasPendientes() {
  if (!usaDB) return [];
  try {
    await asegurarTabla();
    return await sql`select telefono, item_id, titulo, creada from esperas where estado = 'pendiente' order by creada asc`;
  } catch (e) {
    console.error("⚠ No pude leer las esperas:", e.message);
    return [];
  }
}

// Da de baja las esperas que pasaron los 90 días. Devuelve cuántas venció.
async function vencerViejas() {
  if (!usaDB) return 0;
  try {
    const filas = await sql`
      update esperas set estado = 'vencida'
      where estado = 'pendiente' and creada < now() - (${DIAS_VIGENCIA} * interval '1 day')
      returning telefono
    `;
    return filas.length;
  } catch (e) {
    console.error("⚠ No pude vencer las esperas viejas:", e.message);
    return 0;
  }
}

// Texto del aviso. Se usa como cuerpo del mensaje libre y como referencia de lo que
// dice la plantilla (que en Meta lleva el mismo contenido con {{1}} y {{2}}).
function textoAviso(nombre, titulo) {
  const hola = nombre ? `¡Hola ${nombre}!` : "¡Hola!";
  return `${hola} Volvió a estar disponible ${titulo} en La Casa del Cubreasiento. Nos habías pedido que te avisáramos cuando llegara. ¿Seguís interesado/a? Escribinos y te paso precio y detalles.`;
}

// Manda el aviso a UN cliente. Primero por plantilla (única forma segura fuera de las
// 24 h); si falla, texto libre como último intento. Devuelve true solo si salió.
async function avisarA(telefono, nombre, titulo) {
  if (PLANTILLA) {
    try {
      await enviarPlantillaMeta(telefono, PLANTILLA, "es", [
        { type: "body", parameters: [{ type: "text", text: nombre || "cliente" }, { type: "text", text: titulo }] },
      ]);
      return true;
    } catch (e) {
      console.log(`⚠ aviso de stock por plantilla "${PLANTILLA}" falló (${e.message}) — pruebo texto libre`);
    }
  }
  try {
    await enviarTextoMeta(telefono, textoAviso(nombre, titulo));
    return true;
  } catch (e) {
    // Fuera de la ventana de 24 h Meta lo rechaza con code 131047: es lo esperable
    // mientras la plantilla no esté aprobada. La espera queda pendiente y se reintenta.
    console.error(`⚠ no pude avisarle a ${telefono} que llegó "${titulo}": ${e.message}`);
    return false;
  }
}

// Nombre del cliente y si acepta que le escribamos. Si pidió la BAJA (opt_in=false,
// lo que hace el pie de la plantilla), NO se le manda el aviso: se lo prometimos.
// Ante cualquier falla de la base asumimos que sí, que es como venía funcionando.
async function datosCliente(telefono) {
  try {
    const filas = await sql`select nombre, opt_in from clientes where telefono = ${telefono} limit 1`;
    if (!filas.length) return { nombre: "", optIn: true };
    return { nombre: filas[0].nombre || "", optIn: filas[0].opt_in !== false };
  } catch {
    return { nombre: "", optIn: true };
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Repaso que corre después de cada sincronización con Mercado Libre.
// Mira SOLO los productos que alguien está esperando: si volvieron al catálogo
// activo, avisa y cierra la espera. Mirar solo lo esperado (en vez de comparar
// catálogos entre corridas) evita el falso positivo del primer sync tras un deploy.
export async function revisarReposiciones() {
  if (!usaDB) return { revisadas: 0, avisados: 0 };
  await asegurarTabla();
  const vencidas = await vencerViejas();
  const pendientes = await esperasPendientes();
  if (!pendientes.length) return { revisadas: 0, avisados: 0, vencidas };

  const volvieron = pendientes.filter((e) => estaDisponible(e.item_id));
  if (!volvieron.length) return { revisadas: pendientes.length, avisados: 0, vencidas };
  if (!metaConfigurado()) {
    console.log(`ℹ ${volvieron.length} producto(s) esperado(s) volvieron, pero WhatsApp no está configurado: quedan pendientes.`);
    return { revisadas: pendientes.length, avisados: 0, vencidas };
  }

  let avisados = 0;
  let dadosDeBaja = 0;
  for (const esp of volvieron) {
    const { nombre, optIn } = await datosCliente(esp.telefono);
    if (!optIn) {
      // Pidió la baja: cerramos la espera sin escribirle.
      await sql`update esperas set estado = 'vencida' where telefono = ${esp.telefono} and item_id = ${esp.item_id}`;
      dadosDeBaja++;
      continue;
    }
    const salio = await avisarA(esp.telefono, nombre, esp.titulo || "el producto que esperabas");
    if (salio) {
      await sql`update esperas set estado = 'avisada', avisada_en = now() where telefono = ${esp.telefono} and item_id = ${esp.item_id}`;
      avisados++;
    }
    await dormir(250); // un respiro entre envíos, como el broadcast de promos
  }
  if (avisados) console.log(`📦 Avisé a ${avisados} cliente(s) que su producto volvió a estar disponible.`);
  if (dadosDeBaja) console.log(`🔕 ${dadosDeBaja} espera(s) cerradas sin avisar: el cliente pidió la baja.`);
  return { revisadas: pendientes.length, avisados, vencidas, dadosDeBaja };
}
