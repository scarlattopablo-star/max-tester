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
  "cabina", "cabinas", "simple", "sencilla", "doble", "puertas", "scab", "dcab", "economico", "economica", "barato", "barata",
  "sedan", "hatch", "hatchback", "cross",
]);

const _normTxt = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const _mapProd = (item) => ({ nombre: item.n, precio: item.p, precio_lista: item.l, moneda: item.usd ? "USD" : "UYU", img: (item.img || "").replace(/-[A-Z]\.jpg$/i, "-O.jpg") });
// Formatea un precio con su símbolo de moneda. USD => "US$ 60"; UYU => "$ 8.010".
const _fmtPrecio = (precio, moneda) => `${moneda === "USD" ? "US$ " : "$ "}${Number(precio).toLocaleString("es-UY")}`;

// Detecta la CATEGORÍA de producto que pide el cliente (alfombra, cubreasiento, cubre volante,
// cubreauto) para NO mezclar tipos: si pide "alfombra para Saveiro", solo alfombras de Saveiro.
// Devuelve una función que valida el nombre del producto, o null si la consulta no nombra un tipo.
// El ORDEN importa: "cubre volante" contiene "cubre", por eso volante va primero.
function categoriaDe(consulta) {
  const q = _normTxt(consulta);
  if (/(cubre ?volante|volante)/.test(q)) return (n) => /volante/.test(n);
  if (/alfombra/.test(q)) return (n) => /alfombra/.test(n);
  if (/(cubre ?auto|cubreauto|antigranizo|cobertor)/.test(q)) return (n) => /(cubre ?auto|cubreauto|antigranizo|cobertor)/.test(n);
  if (/(cubre ?asiento|cubreasiento|funda|butaca|tapizado)/.test(q)) return (n) => /(cubre ?asiento|cubreasiento|funda|butaca)/.test(n) && !/volante/.test(n);
  return null;
}

// Detecta si el cliente especificó tipo de CABINA (camionetas): simple o doble.
// Devuelve "simple" | "doble" | null. Se usa como filtro suave (solo si hay coincidencias).
function cabinaDe(consulta) {
  const q = _normTxt(consulta);
  if (/(doble cabina|cabina doble|doble cab|d ?cab|cuatro puertas|4 puertas)/.test(q)) return "doble";
  if (/(cabina simple|simple cabina|cab simple|s ?cab|cabina sencilla|dos puertas|2 puertas)/.test(q)) return "simple";
  return null;
}
function _matchCabina(nombre, cab) {
  const m = _normTxt(nombre);
  if (cab === "simple") return /(cabina simple|cab simple|simple|sencilla)/.test(m);
  if (cab === "doble") return /(doble cabina|cabina doble|doble cab|doble)/.test(m);
  return true;
}
// Carrocería (sedán / hatchback) — filtro suave, igual que cabina.
function carroceriaDe(consulta) {
  const q = _normTxt(consulta);
  if (/hatchback|hatch/.test(q)) return "hatch";
  if (/sedan/.test(q)) return "sedan";
  return null;
}
function _matchCarroceria(nombre, carr) {
  const m = _normTxt(nombre);
  if (carr === "hatch") return /hatch/.test(m);
  if (carr === "sedan") return /sedan/.test(m);
  return true;
}

// Busca productos del catálogo priorizando el MODELO/marca (no las palabras genéricas).
export function buscarPrecio(consulta) {
  const palabras = _normTxt(consulta).split(/\s+/).filter((w) => w.length > 1);
  if (!palabras.length) return [];
  const distintivas = palabras.filter((w) => !STOP_BUSQUEDA.has(w)); // modelo, marca, etc.
  // Filtro por TIPO de producto: si el cliente nombra un tipo, NO mezclamos categorías.
  const catFiltro = categoriaDe(consulta);
  const cab = cabinaDe(consulta); // filtro suave por cabina simple/doble
  const carr = carroceriaDe(consulta); // filtro suave por sedán/hatch
  const pool = catFiltro
    ? (PRODUCTOS.productos || []).filter((item) => catFiltro(_normTxt(item.n)))
    : (PRODUCTOS.productos || []);
  // Aplica los filtros suaves (cabina, carrocería) SOLO si quedan resultados; si no, no descarta
  // (mejor ofrecer lo del modelo y, si hace falta, preguntar la variante).
  const aplicarCab = (lista) => {
    let r = lista;
    if (cab) { const f = r.filter((it) => _matchCabina(it.n, cab)); if (f.length) r = f; }
    if (carr) { const f = r.filter((it) => _matchCarroceria(it.n, carr)); if (f.length) r = f; }
    return r;
  };

  if (distintivas.length) {
    // "fuertes" = términos identificatorios (modelo/marca): con letras y largo >=3.
    // Los años/números sueltos (ej "2020") quedan como opcionales para no excluir de más.
    // Modelos cortos alfanuméricos (q5, x3, a3, t5, c3...) también identifican: son obligatorios.
    const esModeloCorto = (w) => /^[a-z]+\d+$|^\d+[a-z]+$/.test(w);
    const fuertes = distintivas.filter((w) => (w.length >= 3 && /[a-z]/.test(w)) || esModeloCorto(w));
    const obligatorias = fuertes.length ? fuertes : distintivas;
    // ESTRICTO: el producto DEBE contener TODAS las obligatorias. Sin comodín a genéricos.
    let res = pool
      .filter((item) => { const m = _normTxt(item.n); return obligatorias.every((d) => m.includes(d)); })
      .map((item) => ({ item, sc: distintivas.filter((d) => _normTxt(item.n).includes(d)).length }))
      .sort((a, b) => b.sc - a.sc) // más específicos primero
      .map((x) => x.item);
    res = aplicarCab(res).slice(0, 6);
    return res.map(_mapProd);
  }

  // Sin palabras distintivas (ej: "alfombra" sin modelo): si hay tipo, devolvemos ese tipo;
  // si no, match por todas las palabras.
  if (catFiltro) return aplicarCab(pool).slice(0, 6).map(_mapProd);
  const base = pool.filter((item) => { const m = _normTxt(item.n); return palabras.every((p) => m.includes(p)); });
  return aplicarCab(base).slice(0, 6).map(_mapProd);
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
  const medios = NEGOCIO.mediosPago.map((m) => `  · ${m}`).join("\n");
  // Datos concretos por medio (los que SÍ tenemos cargados).
  const detalle = [];
  detalle.push(`- TRANSFERENCIA bancaria (tiene ${NEGOCIO.descuentoTransferencia}% de descuento): ${dc.transferencia || "(pedí los datos al equipo con derivar_a_humano; NO los inventes)"}`);
  detalle.push(`- MERCADO PAGO: ${dc.mercadoPagoAlias ? `transferir al alias ${dc.mercadoPagoAlias}` : (dc.mercadoPagoLink ? `link de pago ${dc.mercadoPagoLink}` : `aún no tengo el alias/link cargado; decile que el equipo se lo pasa enseguida y usá "derivar_a_humano". NO inventes alias ni links`)}`);
  detalle.push(`- TARJETAS (Visa, OCA, Master, hasta 6 pagos): se abonan en el local, o el equipo le pasa un link de pago. Si necesita el link, usá "derivar_a_humano". NO inventes links.`);
  detalle.push(`- EFECTIVO: en el local (${NEGOCIO.direccion}).`);

  return `FLUJO DE PAGO (seguilo así, sin abrumar):
1. Cuando el cliente YA decidió comprar, PREGUNTALE PRIMERO cómo le gustaría abonar. Ej: "¿Cómo le gustaría abonar: transferencia, Mercado Pago, tarjeta o efectivo?". NO mandes todos los medios y todos los datos de una.
2. Según lo que elija, dale enseguida la información de ESE medio (no hace falta pedirle nombre/teléfono antes para pasarle los datos de pago; eso se lo pedís recién al tomar el pedido):
${detalle.join("\n")}
3. EXCEPCIÓN: si el cliente PREGUNTA "¿qué medios de pago tienen?" (o similar), ahí SÍ enumerá todos los medios disponibles, cortito:
${medios}
   y recién cuando elija uno, le pasás los datos concretos de ese medio.
4. Recordale el ${NEGOCIO.descuentoTransferencia}% de descuento si elige transferencia.
5. Después de pasar los datos de pago, preguntá cómo desea recibir el producto (envío o retiro; y en CUBREASIENTOS también colocación; ver sección de ENTREGA).
6. Cuando diga que pagó, tomá el pedido (tomar_pedido) y avisá que el equipo confirma el pago a la brevedad. NUNCA inventes números de cuenta, alias ni links.`;
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
- Cuando el cliente pide una foto/imagen, o cuando le ofrecés opciones de un producto, usá la herramienta "enviar_foto" con el producto/modelo.
- CADA PRODUCTO SE MANDA DE A UNO, CON SU PROPIA FOTO: la herramienta envía cada opción como una foto separada, y CADA foto ya lleva en su pie el número + nombre + precio (ej: "1) Cubreasiento Hyundai HB20 - $ 9.304"). El cliente ve cada producto junto a su imagen, uno tras otro.
- ⛔ POR ESO NO REPITAS LA LISTA EN EL TEXTO: NO escribas vos la lista numerada de productos en el mensaje (la info de cada producto ya va en el pie de su foto; repetirla amontona y duplica). Tu texto tiene que ser CORTO: una intro breve ANTES de las fotos ("Le comparto las opciones disponibles para su HB20:") y, si querés, al final UNA pregunta para que elija ("¿Cuál de las opciones le interesa? Indíqueme el número."). Nada más: ni nombres ni precios repetidos en el texto.
- Mostrá TODAS las opciones que devuelve la herramienta (no escondas las más económicas): el cliente decide.
- ⛔ NO MUESTRES LAS FOTOS DOS VECES (clave): una vez que enviaste las opciones numeradas con foto, NO las vuelvas a enviar. Cuando el cliente elige ("la 1", "quiero la 2", "la primera"), AVANZÁ con esa opción (pago/entrega); JAMÁS reenvíes las fotos ni vuelvas a llamar "enviar_foto" para lo mismo.
- ⛔ NO PREGUNTES UNA VARIANTE DESPUÉS DE MOSTRAR: si para acotar necesitás saber una variante (sedán/hatch, piso/baúl, cabina), preguntala ANTES de mostrar las fotos, en un mensaje sin fotos. NUNCA mandes todas las opciones y en el mismo mensaje preguntes "¿Hatch o Sedan?" (eso te obliga a re-mostrar y confunde). Para ALFOMBRAS de autos NO hace falta preguntar sedán/hatch ni piso/baúl: mostrá todas las opciones del modelo de una sola vez (el nombre de cada una ya dice si es de piso, baúl, sedán o hatch) y que el cliente elija por número. Solo filtrá por variante si el cliente la mencionó él mismo en su consulta.

# SI NO ENCONTRÁS EL PRODUCTO o NO SABÉS ALGO (importante)
- NUNCA inventes datos, precios, plazos ni características.
- Si el producto NO aparece en el catálogo, o te preguntan algo que no podés resolver (un costo no especificado, un caso especial), indicá con cortesía que lo va a consultar con un vendedor para darle una respuesta precisa, y usá la herramienta "derivar_a_humano" (motivo "otro") con el resumen. Ej: "Permítame consultarlo con un vendedor y le confirmo a la brevedad". Así no queda nada sin resolver.

# Qué hacés
1. Respondés consultas sobre los productos.
2. Asesorás según el vehículo del cliente.
3. Vendés: tomás el pedido y explicás los medios de pago.
4. Coordinás la entrega: envío o retiro (y, solo en cubreasientos, colocación en el local).

# REGLAS DE ATENCIÓN (importante, seguilas)
- OFRECER TODO EL MODELO CON FOTOS (REGLA ESTRICTA, NO LA ROMPAS): SIEMPRE que vayas a mostrar/ofrecer/listar opciones o precios de un producto para un vehículo (ej: "cubreasiento para Hilux", "alfombra para Audi Q5"), TENÉS QUE llamar a la herramienta "enviar_foto" con ese producto+modelo. Esa herramienta manda TODAS las opciones publicadas, cada una con su FOTO + nombre + precio. ⛔ PROHIBIDO listar opciones/precios SOLO en texto: si nombrás una opción con su precio, esa opción DEBE ir acompañada de su foto vía "enviar_foto". NO uses "consultar_precio" para mostrar opciones de un modelo (esa es solo para una consulta puntual de "cuánto sale X"). Recordá: cada opción se manda de a una con su propia foto (con número, nombre y precio en el pie); en el texto NO repitas la lista, solo una intro breve ("Le comparto las opciones disponibles para su Hilux:").
- "enviar_foto" ya incluye el precio de cada opción, así que para ofrecer/mostrar productos de un modelo NO necesitás llamar también a "consultar_precio".
- ⛔ ENVIÁ SOLO LO QUE EL CLIENTE PIDE (REGLA DE ORO, NO LA ROMPAS): si el cliente pregunta por CUBREASIENTOS, mandá únicamente cubreasientos. Si pregunta por ALFOMBRAS, solo alfombras. Si pregunta por CUBRE VOLANTE, solo cubre volante. NUNCA agregues otros productos/accesorios que el cliente NO pidió (no sumes el cubre volante, ni alfombras, ni cubreauto "de yapa"). Llamá a "enviar_foto" UNA sola vez, con el TIPO de producto que pidió + el modelo. Nada de productos sorpresa.
- VENTA ADICIONAL (solo si el cliente abre la puerta): recién DESPUÉS de resolver lo que pidió, y solo si el cliente muestra interés o pregunta "¿qué más tienen?", podés MENCIONAR en texto (sin mandar fotos sin que las pida) que también hay otros accesorios para su vehículo (ej: "Si le interesa, también tenemos cubre volante para su marca"). Nunca al inicio ni sin que lo pida.
- CUBRE VOLANTE — DATO ÚTIL: los cubre volantes están publicados por MARCA, no por modelo (ej: "Cubrevolante Hyundai"). Entonces, cuando el cliente pide un cubre volante, NO le pidas el modelo exacto: con la MARCA alcanza. Si ya sabés la marca (porque la dijo o por el modelo que mencionó antes), mostrale directamente el cubre volante de esa marca con "enviar_foto" (ej: "cubre volante Hyundai"). Solo preguntá la marca si no la sabés. Modelo → marca: HB20/Creta/Tucson = Hyundai; Hilux/Corolla = Toyota; Onix/Montana/S10 = Chevrolet; Polo/Nivus/Gol/Amarok/T-Cross = Volkswagen; Strada/Toro/Cronos = Fiat; Kwid/Oroch/Duster = Renault; 208/2008 = Peugeot; Seagull/Dolphin/Yuan = BYD.
- CAMIONETAS — CABINA SIMPLE O DOBLE: esto aplica SOLO a camionetas/pick-up (Hilux, Ranger, Amarok, Saveiro, Strada, Toro, S10, Frontier, L200, Oroch, Montana, Hilux, etc.). En esos casos, ANTES de ofrecer las opciones preguntá si es CABINA SIMPLE o DOBLE CABINA, porque el producto y las medidas cambian, y mostrá solo lo que corresponda. ⛔ Los AUTOS comunes (HB20, Onix, Polo, Nivus, Corolla, Creta, Tucson, Gol, T-Cross, 208, Kwid, Yaris, etc.) NO tienen tipo de cabina: con un auto NUNCA preguntes por cabina simple/doble, mostrale directamente las opciones.
- ENTREGA (después de definir el producto y los medios de pago): preguntá cómo desea recibirlo. ⚠️ Las opciones DEPENDEN del producto:
  · CUBRE VOLANTES, ALFOMBRAS, CUBREAUTO y demás accesorios: NO se colocan/instalan. Para estos SOLO hay dos opciones: ENVÍO (a todo el país) o RETIRO en el local (${NEGOCIO.direccion}). NUNCA ofrezcas colocación ni agenda para estos productos. Si preguntan si los colocan, aclará con cortesía que esos productos no se colocan (son de fácil colocación uno mismo) y se entregan por envío o retiro.
  · CUBREASIENTOS: además de envío o retiro, SÍ se pueden COLOCAR/instalar en el local.
  Caminos:
  1. ENVÍO: hacemos envíos a todo el país.
  2. RETIRO en el local (${NEGOCIO.direccion}).
  3. COLOCADO/instalado en el local — SOLO para CUBREASIENTOS. Cuando el cliente (de un cubreasiento) elige colocación, ANTES de pedirle ningún dato explicale SIEMPRE, en un solo mensaje breve y en este orden:
     a) que se agenda día y hora;
     b) que para reservar el turno se deja una SEÑA del 50% del total, que puede abonarse por TRANSFERENCIA o MERCADO PAGO;
     c) que la colocación lleva aproximadamente 1 hora y 30 minutos;
     y cerrá preguntando: "¿Desea agendar? Lo contactamos a la brevedad para coordinar el día y la hora."
     Recién SI el cliente acepta agendar, pedile nombre y teléfono, registrá la solicitud con "derivar_a_humano" (motivo "otro", resumen con producto, vehículo y que quiere colocación) y confirmale: "Perfecto, lo contactamos a la brevedad para coordinar." NUNCA confirmes vos una fecha/hora exacta: la coordina el equipo.
- COSTO DE COLOCACIÓN (solo cubreasientos): si el costo de la colocación no está especificado en el catálogo, NO lo inventes: indicá que lo consultás con un vendedor para cotizarlo y derivá (derivar_a_humano).
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
- MONEDA: casi todos los precios están en PESOS uruguayos ($). Si un resultado trae "moneda":"USD", ese precio está en DÓLARES: decilo como "US$ X" (dólares), nunca como pesos. Si es "UYU" o no aclara, son pesos ($).
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
      return { ok: true, enviadas: elegidas.length, fotos: elegidas.map((x) => ({ nombre: x.nombre, img: x.img, precio: x.precio, moneda: x.moneda })) };
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

    // Cada producto se envía como SU PROPIA foto, con su nombre y precio en el caption,
    // de a uno. Se numeran (1, 2, 3...) y se evitan duplicados.
    let fotosCrudas = acciones
      .filter((a) => a.herramienta === "enviar_foto" && a.resultado?.ok)
      .flatMap((a) => a.resultado.fotos)
      .filter((f) => f && f.img);
    const _vistas = new Set();
    fotosCrudas = fotosCrudas.filter((f) => { if (_vistas.has(f.img)) return false; _vistas.add(f.img); return true; });
    const imagenesEnviar = fotosCrudas.map((f, i) => ({
      url: f.img,
      caption: f.precio ? `${i + 1}) ${f.nombre} - ${_fmtPrecio(f.precio, f.moneda)}` : `${i + 1}) ${f.nombre}`,
    }));
    return { texto: (msg.content || "").trim(), acciones, imagenesEnviar };
  }
  return { texto: "Disculpá, se me complicó procesar eso. ¿Lo podés repetir o preferís que te pase con un asesor?", acciones, imagenesEnviar: [] };
}
