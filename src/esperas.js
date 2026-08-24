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
import { estaDisponible, productos } from "./catalogo_vivo.js";

// Cuánto vive una espera. Pasado ese plazo se vence sola y NO se avisa: si el
// producto tarda medio año en volver, el cliente ya compró en otro lado y el
// mensaje cae mal.
const DIAS_VIGENCIA = 90;

// Las PREVENTAS viven mas: se anota gente meses antes del arribo y la fecha de
// importacion se corre sola. Con los 90 dias de una espera comun, quien se anota
// hoy (23 ago 2026) vence el 21 de noviembre y el arribo estimado es el 15: una
// semana de atraso y el aviso NO sale. Ese margen es demasiado poco.
const DIAS_VIGENCIA_PREVENTA = 150;

// Plantilla aprobada en Meta. PLANTILLA_STOCK="" la desactiva (queda solo el texto libre).
const PLANTILLA = process.env.PLANTILLA_STOCK ?? "volvio_stock_max";

// La preventa necesita SU plantilla: "volvio a estar disponible" es falso para un
// producto que nunca estuvo a la venta antes.
const PLANTILLA_PREVENTA = process.env.PLANTILLA_PREVENTA ?? "llego_preventa_max";

// ---------------------------------------------------------------------------
// PREVENTAS
// Producto que TODAVIA no existe como publicacion en Mercado Libre. La espera se
// guarda en la misma tabla contra un id sintetico `PREVENTA:<clave>`, asi no hay
// migracion ni una segunda lista para mantener.
//
// El disparador es otro: una espera comun pregunta "se despauso tal publicacion?";
// una preventa pregunta "ya aparecio una publicacion ACTIVA que sea esto?".
// ---------------------------------------------------------------------------
export const PREVENTAS = {
  tesla: {
    // El titulo entra en el aviso: tiene que cerrar la frase "Llegaron ___".
    titulo: "las alfombras 3D para Tesla",
    // Pide las DOS palabras a proposito. Con solo /tesla/ cualquier publicacion
    // futura de la marca (un cubreasiento, un cubrevolante) dispararia el aviso y
    // le escribiriamos a gente que espera otra cosa.
    patron: (n) => /tesla/i.test(n) && /alfombra/i.test(n),
  },
};

const PREF = "PREVENTA:";
export const esPreventa = (id) => String(id || "").startsWith(PREF);
const preventaDe = (id) => PREVENTAS[String(id || "").slice(PREF.length)] || null;

// Ya entro el stock? Se mira el catalogo ACTIVO (lo que se puede comprar), no la
// lista de agotados: una publicacion creada pero pausada todavia no es llegada.
function preventaLlego(itemId) {
  const pv = preventaDe(itemId);
  if (!pv) return false;
  return productos().some((p) => pv.patron(String(p.n || "")));
}

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
  // El nombre que dio el cliente al anotarse. Va aca y no solo en `clientes`
  // porque ahi el nombre solo se completa si estaba vacio: si la ficha ya traia
  // otro, el aviso saldria con el equivocado.
  await sql`alter table esperas add column if not exists nombre text default ''`;
  listo = true;
}

// ¿Se puede usar la lista de espera? Sin base no hay dónde anotar: Max NO tiene que
// prometerle al cliente un aviso que nunca va a llegar.
export function hayEsperas() {
  return usaDB;
}

// Anota (o revive) la espera de un cliente por una publicación concreta de ML.
// Si el mismo cliente ya se había anotado por lo mismo, no se duplica: se reabre.
export async function anotarEspera({ telefono, itemId, titulo = "", nombre = "" }) {
  if (!usaDB) return { ok: false, motivo: "sin_base" };
  const tel = aWaId(telefono);
  const item = String(itemId || "").trim();
  if (!tel || !item) return { ok: false, motivo: "datos_incompletos" };
  try {
    await asegurarTabla();
    await sql`
      insert into esperas (telefono, item_id, titulo, nombre, estado, creada)
      values (${tel}, ${item}, ${titulo}, ${nombre}, 'pendiente', now())
      on conflict (telefono, item_id) do update set
        estado = 'pendiente',
        creada = now(),
        avisada_en = null,
        titulo = case when excluded.titulo <> '' then excluded.titulo else esperas.titulo end,
        nombre = case when excluded.nombre <> '' then excluded.nombre else esperas.nombre end
    `;
    return { ok: true };
  } catch (e) {
    console.error("⚠ No pude anotar la espera:", e.message);
    return { ok: false, motivo: String(e.message || e) };
  }
}

// Anota a alguien en una PREVENTA. El telefono puede ser distinto al del chat:
// hay gente que escribe desde la web o desde un numero que despues no usa.
export async function anotarPreventa({ telefono, clave = "tesla", nombre = "" }) {
  const pv = PREVENTAS[clave];
  if (!pv) return { ok: false, motivo: "preventa_desconocida" };
  return anotarEspera({ telefono, itemId: PREF + clave, titulo: pv.titulo, nombre });
}

// Esperas vivas (para el repaso y para diagnosticar).
export async function esperasPendientes() {
  if (!usaDB) return [];
  try {
    await asegurarTabla();
    return await sql`select telefono, item_id, titulo, nombre, creada from esperas where estado = 'pendiente' order by creada asc`;
  } catch (e) {
    console.error("⚠ No pude leer las esperas:", e.message);
    return [];
  }
}

// Anotados en una PREVENTA, TODOS: los pendientes, los que ya recibieron el aviso
// y los vencidos. Lo lee el cuadro "interesados" del panel /admin de la web, que
// necesita mostrar el estado de cada uno (no solo quien sigue esperando).
// Solo lectura: la lista la escribe Max en la charla, con anotarPreventa().
export async function listarPreventas({ clave = "", limite = 500 } = {}) {
  if (!usaDB) return [];
  try {
    await asegurarTabla();
    // Una preventa concreta ("tesla") o todas. Cuando llegue una segunda, el
    // panel las separa por `clave` sin tocar nada de esto.
    const filas = clave
      ? await sql`select telefono, item_id, titulo, nombre, estado, creada, avisada_en
          from esperas where item_id = ${PREF + clave} order by creada desc limit ${limite}`
      : await sql`select telefono, item_id, titulo, nombre, estado, creada, avisada_en
          from esperas where item_id like ${PREF + "%"} order by creada desc limit ${limite}`;
    return filas.map((f) => ({
      // El numero AL QUE HAY QUE ESCRIBIRLE, que puede no ser el del chat: Max le
      // pregunta "a este mismo numero o a otro?" antes de anotarlo.
      telefono: f.telefono || "",
      clave: String(f.item_id || "").slice(PREF.length),
      titulo: f.titulo || "",
      nombre: f.nombre || "",
      estado: f.estado || "pendiente",
      creada: f.creada,
      avisadaEn: f.avisada_en || null,
    }));
  } catch (e) {
    console.error("⚠ No pude leer las preventas:", e.message);
    return [];
  }
}

// Que preventas hay abiertas y si su stock YA entro. El panel lo usa para explicar
// por que el aviso todavia no salio (el arribo se corre solo, y sin publicacion
// activa en ML no hay disparador).
export function estadoPreventas() {
  return Object.entries(PREVENTAS).map(([clave, pv]) => ({
    clave,
    titulo: pv.titulo,
    llego: preventaLlego(PREF + clave),
  }));
}

// Da de baja las esperas que pasaron los 90 días. Devuelve cuántas venció.
async function vencerViejas() {
  if (!usaDB) return 0;
  try {
    const filas = await sql`
      update esperas set estado = 'vencida'
      where estado = 'pendiente' and (
        (item_id not like ${PREF + "%"} and creada < now() - (${DIAS_VIGENCIA} * interval '1 day'))
        or
        (item_id like ${PREF + "%"} and creada < now() - (${DIAS_VIGENCIA_PREVENTA} * interval '1 day'))
      )
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
// Mismo texto que la plantilla `llego_preventa_max`, para la caida a texto libre.
function textoAvisoPreventa(nombre, titulo) {
  const hola = nombre ? `¡Hola ${nombre}!` : "¡Hola!";
  return `${hola} Llegaron ${titulo} que estabas esperando en La Casa del Cubreasiento. Te habías anotado en la preventa y te las guardamos. ¿Querés que te pase precio y coordinemos la entrega?`;
}

function textoAviso(nombre, titulo) {
  const hola = nombre ? `¡Hola ${nombre}!` : "¡Hola!";
  return `${hola} Volvió a estar disponible ${titulo} en La Casa del Cubreasiento. Nos habías pedido que te avisáramos cuando llegara. ¿Seguís interesado/a? Escribinos y te paso precio y detalles.`;
}

// Manda el aviso a UN cliente. Primero por plantilla (única forma segura fuera de las
// 24 h); si falla, texto libre como último intento. Devuelve true solo si salió.
async function avisarA(telefono, nombre, titulo, preventa = false) {
  const plantilla = preventa ? PLANTILLA_PREVENTA : PLANTILLA;
  const cuerpo = preventa ? textoAvisoPreventa : textoAviso;
  if (plantilla) {
    try {
      await enviarPlantillaMeta(telefono, plantilla, "es", [
        { type: "body", parameters: [{ type: "text", text: nombre || "cliente" }, { type: "text", text: titulo }] },
      ]);
      return true;
    } catch (e) {
      console.log(`⚠ aviso de stock por plantilla "${plantilla}" falló (${e.message}) — pruebo texto libre`);
    }
  }
  try {
    await enviarTextoMeta(telefono, cuerpo(nombre, titulo));
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

  // Cada tipo de espera pregunta lo suyo: la comun si la publicacion volvio, la
  // preventa si la publicacion aparecio por primera vez.
  const volvieron = pendientes.filter((e) =>
    esPreventa(e.item_id) ? preventaLlego(e.item_id) : estaDisponible(e.item_id));
  if (!volvieron.length) return { revisadas: pendientes.length, avisados: 0, vencidas };
  if (!metaConfigurado()) {
    console.log(`ℹ ${volvieron.length} producto(s) esperado(s) volvieron, pero WhatsApp no está configurado: quedan pendientes.`);
    return { revisadas: pendientes.length, avisados: 0, vencidas };
  }

  let avisados = 0;
  let dadosDeBaja = 0;
  for (const esp of volvieron) {
    const { nombre: nomFicha, optIn } = await datosCliente(esp.telefono);
    // Gana el nombre que dio al anotarse: es el que dijo para ESTO.
    const nombre = esp.nombre || nomFicha;
    if (!optIn) {
      // Pidió la baja: cerramos la espera sin escribirle.
      await sql`update esperas set estado = 'vencida' where telefono = ${esp.telefono} and item_id = ${esp.item_id}`;
      dadosDeBaja++;
      continue;
    }
    const salio = await avisarA(esp.telefono, nombre, esp.titulo || "el producto que esperabas", esPreventa(esp.item_id));
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
