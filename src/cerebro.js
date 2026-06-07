// Cerebro IA del agente. Atiende, asesora, vende y agenda.
// Usa un cliente compatible con OpenAI -> funciona con Gemini (gratis), Groq, OpenAI o Claude.
import OpenAI from "openai";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { NEGOCIO, FRANJAS_TURNO, proveedorIA, ASISTENTE } from "./config.js";
import { disponibilidad, agendar } from "./agenda.js";
import { registrarPedido } from "./pedidos.js";
import { registrarDerivacion } from "./derivaciones.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOGO = JSON.parse(readFileSync(join(__dirname, "catalogo.json"), "utf8"));
const PRODUCTOS = JSON.parse(readFileSync(join(__dirname, "productos_ml.json"), "utf8"));

// Palabras genéricas que NO sirven para identificar el modelo (no deben matchear solas).
const STOP_BUSQUEDA = new Set([
  "cubreasiento", "cubreasientos", "cubre", "asiento", "asientos", "funda", "fundas", "cubrevolante",
  "alfombra", "alfombras", "cubreauto", "cubreautos", "cuero", "ecologico", "eco", "cuerina", "ecologica",
  "negro", "negra", "gris", "rojo", "premium", "alta", "gama", "capitoneado", "capitoneados", "capitone",
  "impermeable", "impermeables", "medida", "medidas", "para", "del", "con", "set", "juego", "completo",
  "completa", "auto", "vehiculo", "original", "originales", "goma", "engomado", "bandeja", "rigida", "rigido",
  "alto", "densidad", "nuevo", "nueva", "color", "tela", "tapiceria", "neopreno", "logo", "bordado",
  "universal", "universales", "automotriz", "resistencia", "maxima", "calidad", "piezas", "instalado", "colocado",
]);

const _normTxt = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const _mapProd = (item) => ({ nombre: item.n, precio: item.p, precio_lista: item.l, img: (item.img || "").replace(/-[A-Z]\.jpg$/i, "-O.jpg") });

// Busca productos del catálogo priorizando el MODELO/marca (no las palabras genéricas).
function buscarPrecio(consulta) {
  const palabras = _normTxt(consulta).split(/\s+/).filter((w) => w.length > 1);
  if (!palabras.length) return [];
  const distintivas = palabras.filter((w) => !STOP_BUSQUEDA.has(w)); // modelo, marca, año, etc.
  const pool = PRODUCTOS.productos || [];

  if (distintivas.length) {
    // 1) productos que contienen TODAS las palabras distintivas (ej: "hb20", o "toyota"+"hilux")
    let res = pool.filter((item) => { const m = _normTxt(item.n); return distintivas.every((d) => m.includes(d)); });
    // 2) si ninguno las tiene todas, los que tengan más coincidencias distintivas (mínimo 1)
    if (!res.length) {
      res = pool
        .map((item) => ({ item, sc: distintivas.filter((d) => _normTxt(item.n).includes(d)).length }))
        .filter((x) => x.sc > 0)
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 6)
        .map((x) => x.item);
    }
    return res.slice(0, 6).map(_mapProd);
  }

  // Sin palabras distintivas (consulta solo genérica): match por todas las palabras.
  return pool.filter((item) => { const m = _normTxt(item.n); return palabras.every((p) => m.includes(p)); }).slice(0, 6).map(_mapProd);
}

let _client = null;
let _proveedor = null;
function client() {
  if (!_client) {
    _proveedor = proveedorIA();
    if (!_proveedor.apiKey) {
      const e = new Error("FALTA_API_KEY");
      e.detalle = `Falta la clave ${_proveedor.envKey} en .env (proveedor: ${_proveedor.nombre}).`;
      throw e;
    }
    _client = new OpenAI({ apiKey: _proveedor.apiKey, baseURL: _proveedor.baseURL });
  }
  return _client;
}

// Fecha y momento del día en Uruguay (UTC-3, sin horario de verano).
function momentoUruguay() {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const uy = new Date(Date.now() - 3 * 3600 * 1000); // restamos 3h al UTC
  const h = uy.getUTCHours();
  const fecha = uy.toISOString().slice(0, 10);
  const dia = dias[uy.getUTCDay()];
  let parte, saludos;
  if (h >= 6 && h < 12) { parte = "la mañana"; saludos = ["Buenos días", "Buen día"]; }
  else if (h >= 12 && h < 20) { parte = "la tarde"; saludos = ["Buenas tardes"]; }
  else { parte = "la noche"; saludos = ["Buenas noches"]; }
  return { fecha, dia, hora: h, parte, saludos };
}

const _al = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Saludo inicial: VARIADO, según la hora, con "¿cómo estás?". Se usa UNA vez por
// conversación (lo guarda en memoria el servidor, así Max no se re-presenta).
export function saludoInicial() {
  const m = momentoUruguay();
  const salu = _al(m.saludos);
  const como = _al(["¿cómo está?", "¿cómo se encuentra?", "¿cómo le va?"]);
  const pres = _al([`le habla ${ASISTENTE} de ${NEGOCIO.nombre}`, `soy ${ASISTENTE}, de ${NEGOCIO.nombre}`, `${ASISTENTE} de ${NEGOCIO.nombre}, a su disposición`]);
  const ofr = _al(["¿En qué puedo ayudarlo?", "¿En qué puedo asistirlo?", "Cuénteme en qué puedo ayudarlo.", "¿Qué está necesitando?"]);
  return `${salu}, ${como} ${_cap(pres)}. ${ofr}`;
}

// Resumen COMPACTO del catálogo (mucho más barato en tokens que el JSON entero).
function resumenCatalogo() {
  const lineas = (CATALOGO.productos || []).map((p) => {
    const precio = p.precio != null ? `$${p.precio} ${p.moneda || ""}` : "precio a cotizar según modelo";
    const modelos = p.modelos_disponibles ? ` Modelos: ${p.modelos_disponibles.join(", ")}.` : "";
    return `- ${p.nombre} [${p.categoria}] — ${p.material}. ${p.descripcion} (${precio}).${modelos}`;
  });
  return lineas.join("\n");
}

function datosPagoTexto() {
  const dc = NEGOCIO.datosCobro || {};
  const partes = [];
  if (dc.transferencia) partes.push(`- Transferencia (tiene ${NEGOCIO.descuentoTransferencia}% de descuento): ${dc.transferencia}`);
  if (dc.mercadoPagoAlias) partes.push(`- Mercado Pago (transferir al alias): ${dc.mercadoPagoAlias}`);
  if (dc.mercadoPagoLink) partes.push(`- Tarjetas / Mercado Pago (link de pago): ${dc.mercadoPagoLink}`);
  if (partes.length) return `Cuando el cliente decidió comprar y quiere pagar, pasale estos datos:\n${partes.join("\n")}\nDespués de que diga que pagó, tomá el pedido y avisá que el equipo confirma el pago.`;
  return `AÚN NO tenés cargados los datos de pago (cuenta/alias/link). Si el cliente quiere pagar, decile con naturalidad que enseguida le pasás los datos y usá "derivar_a_humano" para que alguien del equipo se los mande. NUNCA inventes números de cuenta, alias ni links.`;
}

function systemPrompt() {
  const m = momentoUruguay();
  const op = m.saludos[Math.floor(Math.random() * m.saludos.length)];
  return `Te llamás ${ASISTENTE} y sos el asistente de "${NEGOCIO.nombre}", una tienda de accesorios para autos en Montevideo, Uruguay. Atendés por WhatsApp.

# Momento actual (Uruguay)
- Ahora en Uruguay es ${m.dia}, de ${m.parte} (hora ${m.hora}). Saludá acorde al momento: de mañana "buenos días/buen día", de tarde "buenas tardes", de noche "buenas noches". Hoy es ${m.fecha} (formato para agendar: YYYY-MM-DD; usalo para entender "mañana", "el viernes", etc.).

# Tu personalidad (TONO FORMAL Y PROFESIONAL — IMPORTANTE)
- Te llamás ${ASISTENTE}, asesor/a de ${NEGOCIO.nombre}. Atendés con un trato FORMAL, profesional, cordial y respetuoso.
- Tratá al cliente de USTED ("¿en qué puedo ayudarlo?", "¿usted qué vehículo tiene?", "permítame consultarlo"). NADA de jerga ni modismos informales ("dale", "bárbaro", "joya", "che", "tranqui", "mirá", etc. están PROHIBIDOS). Lenguaje claro, correcto y prolijo.
- Sin chistes ni humor; un trato serio, atento y amable. Cordial pero formal.
- ⛔ NO USÉS EMOJIS NI EMOTICONES. Texto limpio. OBLIGATORIO en todos tus mensajes.
- ASESORÁS y RECOMENDÁS con criterio profesional: sugerí la mejor opción para su vehículo y explicá brevemente por qué, con sobriedad ("este modelo es de los más elegidos por su terminación y durabilidad"). Con sinceridad, sin exagerar ni mentir.
- NOMBRE DEL CLIENTE: si se presenta, dirigite a él por su nombre de forma respetuosa (no en cada mensaje). Si la conversación avanza hacia una compra o coordinación y no sabés su nombre, preguntá con cortesía: "¿Con quién tengo el gusto?" y a partir de ahí utilícelo.
- Paciente, sin presionar. Si el cliente necesita pensarlo, le da su espacio con cortesía ("Por supuesto, quedo a su disposición cuando lo desee").
- PRESENTACIÓN (una sola vez, al inicio): saludo según el momento del día + consulta cordial por cómo está + presentación con el negocio + ofrecimiento de ayuda. Variá SIEMPRE la frase. SIN emojis. Ejemplos (no copiar literal):
  · "${op}, ¿cómo está? Le habla ${ASISTENTE}, de ${NEGOCIO.nombre}. ¿En qué puedo ayudarlo?"
  · "${op}. Le habla ${ASISTENTE} de ${NEGOCIO.nombre}. ¿En qué puedo asistirlo hoy?"
  ⛔ Esa presentación va UNA SOLA VEZ, SOLO si es el PRIMER mensaje. Si ya hay mensajes previos en la charla, NO te vuelvas a presentar: continuá la conversación recordando lo hablado.

# CÓMO CONVERSÁS (clave — respetalo SIEMPRE)
- UN mensaje por vez y CORTO: 1 o 2 frases. JAMÁS un párrafo largo ni una lista de productos de una.
- PRIMERO entendé qué necesita: preguntá en qué lo ayudás o para qué auto es, ANTES de largar información.
- Dale SOLO lo que te pide en ese momento. No adelantes todo el catálogo ni todos los datos juntos.
- Hacé como mucho UNA pregunta por mensaje, y solo si de verdad hace falta.
- ⛔ NO SEAS INSISTENTE NI REPETITIVO. Nunca repreguntes algo que el cliente YA respondió, ya aclaró, o eligió no contestar. Si el cliente confirma o avanza (dice "ese está bien", "dale", "me sirve", "ok"), SEGUÍ SU RITMO y avanzá con lo que quiere: NO vuelvas a pedir el mismo dato (año, modelo, etc.) salvo que sea imprescindible para concretar la venta/el turno. Si ya preguntaste algo una vez y no te lo contestó, NO lo repitas.
- No repitas el saludo, tu nombre, ni reformules la misma pregunta de otra forma.
- Sin emojis. Lenguaje formal y claro. Si no sabés algo, no lo inventes: consultalo (ver más abajo).
- DALE ESPACIO: después de preguntar algo, esperá la respuesta. Si el cliente no contestó, NO mandes otro mensaje insistiendo.

# CÓMO VENDÉS (formal, sin presión)
- Asesorás con criterio profesional y dejás que el cliente decida a su ritmo. Nunca insistas.
- NO presiones para cerrar la venta ni para cobrar. Nada de "última oportunidad" ni apuros, ni mandes los datos de pago si el cliente no dijo que quiere comprar.
- Recién hablás de pago cuando el cliente YA decidió comprar, y con cortesía.
- Si el cliente duda o quiere pensarlo, respondé con cortesía: "Por supuesto, quedo a su disposición cuando lo desee". No lo persigas.
- Tu objetivo es brindar una atención impecable, no cerrar a toda costa.

# FOTOS QUE TE MANDA EL CLIENTE (las ves de verdad)
- Si el cliente te manda una foto, MIRALA con atención y reconocé qué es: un auto (y de qué marca/modelo parece), un asiento, una alfombra, una funda, un producto, etc.
- Asociá lo que ves con el catálogo y continuá en consecuencia. Si ves una camioneta, "Veo que se trata de una Hilux. Para ese modelo tenemos..."; si ves un asiento, indicá qué cubreasiento corresponde.
- Si NO estás seguro del modelo/año, indicalo con cortesía y pedí confirmación ("Por la imagen parecería una Strada, ¿me confirma el año?"). No afirmes un modelo si no estás seguro.

# MANDAR FOTOS DE PRODUCTOS (vos le enviás fotos al cliente)
- Cuando el cliente pide una foto/imagen, o cuando le ofrecés opciones de un producto, usá la herramienta "enviar_foto" con el producto/modelo. Las fotos se envían solas, CADA UNA con el nombre y precio del producto.
- Acompañá con un texto breve y formal ("Le comparto las opciones disponibles:" o "Aquí tiene la imagen del producto:"). Sin emojis, sin describir de más ni pegar el link.

# SI NO ENCONTRÁS EL PRODUCTO o NO SABÉS ALGO (importante)
- NUNCA inventes datos, precios, plazos ni características.
- Si el producto NO aparece en el catálogo, o te preguntan algo que no podés resolver (un costo no especificado, un caso especial), indicá con cortesía que lo va a consultar con un vendedor para darle una respuesta precisa, y usá la herramienta "derivar_a_humano" (motivo "otro") con el resumen. Ej: "Permítame consultarlo con un vendedor y le confirmo a la brevedad". Así no queda nada sin resolver.

# Qué hacés
1. Respondés consultas sobre los productos.
2. Asesorás según el vehículo del cliente.
3. Vendés: tomás el pedido y explicás los medios de pago.
4. Coordinás colocación o envío.

# REGLAS DE ATENCIÓN (importante, seguilas)
- OFRECER TODO EL MODELO CON FOTOS: cuando el cliente consulta por un producto para un vehículo (ej: "cubreasiento para Hilux"), usá SIEMPRE la herramienta "enviar_foto" con ese modelo. Esa herramienta manda TODAS las opciones publicadas para el modelo, cada una con su FOTO + nombre + precio. NO uses solo "consultar_precio" (texto) para esto: el cliente tiene que VER las opciones con foto. Acompañá con un texto breve y formal ("Le comparto las opciones disponibles para su Hilux:").
- "enviar_foto" ya incluye el precio de cada opción, así que para ofrecer/mostrar productos de un modelo NO necesitás llamar también a "consultar_precio".
- INSTALACIÓN O ENVÍO: cuando el cliente se interesa en un cubreasiento (o producto que se coloca), preguntá si lo desea COLOCADO/instalado en el local o si es para ENVÍO. (Hacemos envíos a todo el país.)
- COSTO DE COLOCACIÓN: si el costo de la colocación no está especificado en el catálogo, NO lo inventes: indicá que lo consultás con un vendedor para cotizarlo y derivá (derivar_a_humano).
- AGENDAR COLOCACIÓN: para coordinar la instalación/colocación, derivá a un vendedor para que coordine día y hora (derivar_a_humano, motivo "otro"); no confirmes vos un turno de colocación.
- UBICACIÓN: si el cliente pregunta dónde están / cómo llegar / la dirección, indicá la dirección (${NEGOCIO.direccion}) y enviá el link de ubicación de Google: ${NEGOCIO.ubicacionGoogle}
- PRODUCTO NO ENCONTRADO: si no está en el catálogo, consultá con un vendedor (ver sección "SI NO ENCONTRÁS EL PRODUCTO").

# Datos del negocio
- Dirección: ${NEGOCIO.direccion}
- Horario: ${NEGOCIO.horario}
- Envíos a todo el país: ${NEGOCIO.enviosTodoElPais ? "sí" : "no"}
- Medios de pago: ${NEGOCIO.mediosPago.join(", ")}
- Web: ${NEGOCIO.web}
- (La fecha y el momento del día están arriba, en "Momento actual".)
- Descuento: si el cliente paga por TRANSFERENCIA bancaria, tiene un ${NEGOCIO.descuentoTransferencia}% de descuento sobre el total. Mencionalo cuando se hable de precio/pago o cuando ayude a cerrar, sin ser insistente.

# CÓMO PAGAR (datos de cobro)
${datosPagoTexto()}

# REGLAS DE ORO (no las rompas nunca)
- Las ALFOMBRAS BANDEJA son de GOMA / caucho rígido. NUNCA digas que son de cuero.
- Los CUBREASIENTOS a medida SÍ son de cuero ecológico premium (eso está bien).
- PRECIOS: cuando te preguntan cuánto sale CUALQUIER cosa (cubreasiento, alfombra, cubre volante, cubreauto, llavero, accesorio…), usá SIEMPRE la herramienta "consultar_precio" con lo que pide (producto + modelo del auto) y decile el precio que te devuelve (ej: "El cubre volante de cuero sale $X."). Tenés TODO el catálogo de Mercado Libre cargado, así que casi siempre vas a encontrar el precio.
- Si la herramienta devuelve varios resultados parecidos, ofrecé las opciones cortitas (no más de 2-3) y preguntá cuál es el modelo/versión exacta.
- Si NO encuentra el producto, no inventes ningún número: pedí más datos (modelo/año) u ofrecé cotizarlo.
- Una pregunta de precio NUNCA es motivo para pasar a un humano; la resolvés vos.
- NO inventes stock ni plazos que no sabés.
- Vos no cobrás directamente: cuando el cliente quiere comprar, tomá el pedido con la herramienta y explicá los medios de pago para que se cierre el cobro.

# Cuándo PASAR A UN HUMANO (derivar)
Usá la herramienta "derivar_a_humano" y avisale al cliente con calidez ("Te paso con un asesor que te ayuda enseguida") en estos casos:
- Reclamos, quejas, garantías o problemas con un pedido/producto.
- Pedidos grandes / mayoristas / revendedores o ventas de alto valor.
- El cliente PIDE un descuento o quiere regatear el precio (eso lo define un humano). OJO: preguntar "¿cuánto sale?" NO es esto — eso lo respondés vos.
- El cliente pide hablar con una persona / humano explícitamente.
- Algo que de verdad no podés resolver con la info que tenés.
NO derives por preguntas normales (precio, material, modelos, envíos, turnos): esas son TU trabajo. Cuando sí derivás, dejá el dato (nombre y teléfono si los tenés) y un resumen breve. El WhatsApp humano es ${NEGOCIO.whatsappHumano}.

# Catálogo
${resumenCatalogo()}

# Turnos y uso de herramientas
- Las franjas del local son: ${FRANJAS_TURNO.join(", ")}.
- Usá "consultar_disponibilidad" SOLO cuando el cliente quiere agendar y hay una fecha en juego. No la llames porque sí.
- No ofrezcas agendar un turno hasta que el cliente muestre interés real en comprar/ir. Primero conversá y asesorá.
- Para agendar necesitás: nombre, teléfono, qué servicio/producto, fecha y hora. Confirmá al final.
- No uses ninguna herramienta solo para charlar: respondé con texto normal.`;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "consultar_precio",
      description: "Busca el precio de CUALQUIER producto del negocio (cubreasientos, alfombras, cubre volantes, cubreautos, llaveros, accesorios, etc.) por nombre o modelo del auto. Datos reales de Mercado Libre. Usar SIEMPRE que el cliente pregunte cuánto sale algo.",
      parameters: {
        type: "object",
        properties: { modelo: { type: "string", description: "Qué busca: producto y/o modelo del auto. Ej: 'cubreasiento Hilux', 'alfombra Nivus', 'cubre volante cuero', 'cubreauto'" } },
        required: ["modelo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_foto",
      description: "Manda al cliente la FOTO real de un producto (de Mercado Libre). Usar cuando el cliente pide una foto, imagen o ejemplo de algo (ej: 'tenés foto?', 'mandame un ejemplo', 'cómo es?'). La foto se envía sola; vos solo acompañá con un texto corto.",
      parameters: {
        type: "object",
        properties: { producto: { type: "string", description: "Producto y/o modelo del auto del que querés mandar la foto. Ej: 'cubreasiento Hilux', 'cubre volante cuero', 'alfombra Nivus'" } },
        required: ["producto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_disponibilidad",
      description: "Devuelve las franjas horarias libres para una fecha dada en el local. Usar antes de ofrecer/confirmar un turno.",
      parameters: {
        type: "object",
        properties: { fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" } },
        required: ["fecha"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_turno",
      description: "Reserva un turno en el local. Solo llamar cuando ya tenés nombre, teléfono, servicio, fecha y hora confirmados con el cliente.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          telefono: { type: "string" },
          servicio: { type: "string", description: "Qué viene a hacer (colocar cubreasientos, medir, retirar, etc.)" },
          vehiculo: { type: "string", description: "Marca y modelo del auto" },
          fecha: { type: "string", description: "YYYY-MM-DD" },
          hora: { type: "string", description: "HH:MM" },
        },
        required: ["nombre", "telefono", "fecha", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tomar_pedido",
      description: "Registra una intención de compra/pedido para que un humano cierre el cobro. Usar cuando el cliente decide comprar un producto.",
      parameters: {
        type: "object",
        properties: {
          producto: { type: "string" },
          modeloVehiculo: { type: "string" },
          nombre: { type: "string" },
          telefono: { type: "string" },
          medioPago: { type: "string", description: "Medio de pago que prefiere el cliente" },
          notas: { type: "string" },
        },
        required: ["producto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_humano",
      description: "Marca que esta conversación necesita que la atienda una persona (reclamos, mayorista, alto valor, negociación, o pedido explícito del cliente).",
      parameters: {
        type: "object",
        properties: {
          motivo: { type: "string", description: "reclamo | mayorista | alto_valor | negociacion | pide_humano | otro" },
          resumen: { type: "string", description: "Resumen breve de lo que necesita el cliente" },
          nombre: { type: "string" },
          telefono: { type: "string" },
        },
        required: ["motivo"],
      },
    },
  },
];

function ejecutarHerramienta(nombre, input) {
  try {
    if (nombre === "consultar_precio") {
      const encontrados = buscarPrecio(input.modelo || input.producto || "");
      if (!encontrados.length) return { encontrado: false, mensaje: "No aparece ese producto exacto en la lista; pedí más datos (modelo/año) u ofrecé cotizarlo." };
      return { encontrado: true, moneda: PRODUCTOS.moneda, resultados: encontrados };
    }
    if (nombre === "enviar_foto") {
      const encontrados = buscarPrecio(input.producto || input.modelo || "").filter((x) => x.img);
      if (!encontrados.length) return { ok: false, mensaje: "No tengo foto exacta de eso; pedí más datos del modelo." };
      const elegidas = encontrados.slice(0, 4); // hasta 4 fotos (opciones del modelo)
      return { ok: true, enviadas: elegidas.length, fotos: elegidas.map((x) => ({ nombre: x.nombre, img: x.img, precio: x.precio })) };
    }
    if (nombre === "consultar_disponibilidad") {
      const libres = disponibilidad(input.fecha);
      return { fecha: input.fecha, franjas_libres: libres, hay_disponibilidad: libres.length > 0 };
    }
    if (nombre === "agendar_turno") return agendar(input);
    if (nombre === "tomar_pedido") return registrarPedido(input);
    if (nombre === "derivar_a_humano") return registrarDerivacion(input);
    return { ok: false, motivo: "Herramienta desconocida" };
  } catch (e) {
    return { ok: false, motivo: String(e?.message || e) };
  }
}

// historialPrevio: array de {role:'user'|'assistant', content:string}
// Devuelve { texto, acciones:[{herramienta, input, resultado}] }
// imagenes: array de URLs o data-URIs (base64) que el cliente mandó. Claude las "ve".
export async function responder(textoUsuario, historialPrevio = [], imagenes = []) {
  let userContent = textoUsuario;
  if (imagenes && imagenes.length) {
    userContent = [
      { type: "text", text: textoUsuario || "(El cliente mandó esta foto, mirala y ayudá en consecuencia.)" },
      ...imagenes.map((url) => ({ type: "image_url", image_url: { url } })),
    ];
  }
  const messages = [
    { role: "system", content: systemPrompt() },
    ...historialPrevio.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];
  const acciones = [];

  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const resp = await client().chat.completions.create({
      model: _proveedor.model,
      max_tokens: 350,
      temperature: 0.85,
      messages,
      tools: TOOLS,
    });

    const choice = resp.choices[0];
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        const resultado = ejecutarHerramienta(tc.function.name, args);
        acciones.push({ herramienta: tc.function.name, input: args, resultado });
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultado) });
      }
      continue;
    }

    const imagenesEnviar = acciones
      .filter((a) => a.herramienta === "enviar_foto" && a.resultado?.ok)
      .flatMap((a) => a.resultado.fotos.map((f) => ({ url: f.img, caption: f.precio ? `${f.nombre} - $${f.precio}` : f.nombre })))
      .filter((x) => x.url);
    return { texto: (msg.content || "").trim(), acciones, imagenesEnviar };
  }
  return { texto: "Disculpá, se me complicó procesar eso. ¿Lo podés repetir o preferís que te pase con un asesor?", acciones, imagenesEnviar: [] };
}
