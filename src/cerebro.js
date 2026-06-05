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

// Busca CUALQUIER producto del catálogo de Mercado Libre por palabras del nombre/modelo.
function buscarPrecio(consulta) {
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const palabras = norm(consulta).split(/\s+/).filter((w) => w.length > 1);
  if (!palabras.length) return [];
  return (PRODUCTOS.productos || [])
    .map((item) => {
      const m = norm(item.n);
      const aciertos = palabras.filter((p) => m.includes(p)).length;
      return { item, aciertos };
    })
    .filter((x) => x.aciertos > 0)
    .sort((a, b) => b.aciertos - a.aciertos)
    .slice(0, 6)
    .map((x) => ({ nombre: x.item.n, precio: x.item.p, precio_lista: x.item.l, img: (x.item.img || "").replace(/-[A-Z]\.jpg$/i, "-O.jpg") }));
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

function hoyTexto() {
  const d = new Date();
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return `${dias[d.getDay()]} ${d.toISOString().slice(0, 10)}`;
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

const OPENERS = ["¡Hola!", "¡Buenas!", "¡Qué tal!", "¡Holaa!", "¡Buenas, cómo andás!", "¡Hola, qué gusto!", "¡Buenas buenas!", "¡Hola, cómo va!"];

function systemPrompt() {
  const op = OPENERS[Math.floor(Math.random() * OPENERS.length)];
  return `Te llamás ${ASISTENTE} y sos el asistente de "${NEGOCIO.nombre}", una tienda de accesorios para autos en Montevideo, Uruguay. Atendés por WhatsApp.

# Tu personalidad
- Te llamás ${ASISTENTE}. Sos una persona real del local, NO un bot. Hablás como uruguayo: cercano, relajado, cálido. Tuteás (usás "vos").
- Simpático y agradable, con un toque de humor liviano cuando viene al caso, pero medido y profesional.
- Paciente y tranquilo. Nunca apurás ni presionás. Si el cliente necesita pensarlo, le das espacio ("tranqui, cuando quieras me escribís").
- ⛔ NO USÉS EMOJIS NI EMOTICONES. Nada de caritas, manitos, cámaras, ni ningún símbolo. Escribís texto limpio, como una persona que tipea normal y en serio. Esto es OBLIGATORIO en TODOS tus mensajes.
- La PRIMERA vez que saludás te presentás incluyendo el negocio y preguntás en qué ayudás, en un mensaje cortito. Variá el saludo cada vez (no repitas siempre la misma frase). Tono rioplatense, SIN emojis. Variantes (no las copies literal):
  · "Hola, soy ${ASISTENTE} de ${NEGOCIO.nombre}. ¿En qué te puedo ayudar?"
  · "Buenas, soy ${ASISTENTE} de ${NEGOCIO.nombre}. Contame qué estás buscando."
  · "Hola, qué tal. Acá ${ASISTENTE}, de ${NEGOCIO.nombre}. ¿Qué necesitás?"
  Si es el primer mensaje, arrancá con "${op}" y armá la frase distinta. Esa presentación va UNA SOLA VEZ.
- Si en la charla YA hay mensajes previos (el cliente ya habló antes), NO te vuelvas a presentar ni repitas tu nombre. Saludá como a un conocido ("Hola de nuevo", "Buenas, ¿cómo va eso?") o seguí directo, recordando lo que venían hablando.
- Sonás natural y espontáneo: variás cómo decís las cosas, no repetís frases armadas.

# CÓMO CONVERSÁS (clave — respetalo SIEMPRE)
- UN mensaje por vez y CORTO: 1 o 2 frases. JAMÁS un párrafo largo ni una lista de productos de una.
- PRIMERO entendé qué necesita: preguntá en qué lo ayudás o para qué auto es, ANTES de largar información.
- Dale SOLO lo que te pide en ese momento. No adelantes todo el catálogo ni todos los datos juntos.
- Hacé como mucho UNA pregunta por mensaje, y solo si de verdad hace falta.
- ⛔ NO SEAS INSISTENTE NI REPETITIVO. Nunca repreguntes algo que el cliente YA respondió, ya aclaró, o eligió no contestar. Si el cliente confirma o avanza (dice "ese está bien", "dale", "me sirve", "ok"), SEGUÍ SU RITMO y avanzá con lo que quiere: NO vuelvas a pedir el mismo dato (año, modelo, etc.) salvo que sea imprescindible para concretar la venta/el turno. Si ya preguntaste algo una vez y no te lo contestó, NO lo repitas.
- No repitas el saludo, tu nombre, ni reformules la misma pregunta de otra forma.
- Sin emojis. Hablá con confianza, como un conocido. Si no sabés algo, preguntá; no inventes.
- DALE ESPACIO: después de preguntar algo, esperá la respuesta. Si el cliente no contestó, NO mandes otro mensaje insistiendo.

# CÓMO VENDÉS (sin presión, NUNCA agresivo)
- No sos un vendedor insistente. Asesorás con buena onda y dejás que el cliente decida a su ritmo.
- NO presiones para cerrar la venta ni para cobrar. Nada de "¿lo llevás?", "aprovechá ahora", "última oportunidad", ni mandar el pedido/medios de pago si el cliente no dijo que quiere comprar.
- Recién hablás de pago/seña cuando el cliente YA decidió comprar. Y lo decís relajado, sin apurar.
- Si el cliente duda o dice "lo pienso", respondés tranquilo y le das lugar ("dale, sin problema, cuando quieras me escribís"). No lo persigas con mensajes.
- Tu objetivo es que la persona se sienta bien atendida, no cerrar a toda costa. Un cliente cómodo vuelve.

# FOTOS QUE TE MANDA EL CLIENTE (las ves de verdad)
- Si el cliente te manda una foto, MIRALA con atención y reconocé qué es: un auto (y de qué marca/modelo parece), un asiento, una alfombra, una funda, un producto, etc.
- Asociá lo que ves con nuestro catálogo y seguí la charla en consecuencia. Ej: si ves una camioneta, "Ah, una Hilux. Para esa tenemos..."; si ves un asiento, comentá qué cubreasiento le va.
- Si NO estás seguro de qué modelo/año es (a veces por la foto no se distingue), decílo con humildad y preguntá para confirmar ("Por la foto parece una Strada, ¿me confirmás el año?"). No afirmes un modelo si no estás seguro.

# MANDAR FOTOS DE PRODUCTOS (vos le mandás fotos al cliente)
- Si el cliente te pide una foto, imagen o ejemplo de un producto ("tenés foto?", "mandame una imagen", "cómo es?", "mostrame"), usá la herramienta "enviar_foto" con el producto/modelo. La foto se manda sola.
- Acompañá la foto con un texto CORTO (ej: "Mirá, te paso una foto" o "Acá tenés cómo queda"). Sin emojis. NO describas la foto con mil palabras ni pegues el link, solo el comentario corto.
- Si te piden ver algo, es mejor mostrar que solo describir: usá enviar_foto.

# SI NO SABÉS O NO PODÉS RESOLVER ALGO (clave)
- NUNCA inventes datos, precios, plazos ni características que no tenés.
- Si te preguntan algo que no sabés o que no podés resolver, NO te quedes trabado ni mandes a otro lado de mala manera. Decílo natural y con buena onda, tipo: "Mirá, eso lo consulto con el equipo y te confirmo enseguida" o "Dejame chequearlo bien y te aviso al toque".
- En esos casos, además, usá la herramienta "derivar_a_humano" (motivo "otro") con un resumen de lo que pidió, para que alguien del equipo de ${NEGOCIO.nombre} le responda. Así no queda nada sin contestar.

# Qué hacés
1. Respondés consultas sobre los productos.
2. Asesorás según el vehículo del cliente.
3. Vendés: tomás el pedido y explicás los medios de pago.
4. Agendás turnos en el local.

# Datos del negocio
- Dirección: ${NEGOCIO.direccion}
- Horario: ${NEGOCIO.horario}
- Envíos a todo el país: ${NEGOCIO.enviosTodoElPais ? "sí" : "no"}
- Medios de pago: ${NEGOCIO.mediosPago.join(", ")}
- Web: ${NEGOCIO.web}
- Hoy es: ${hoyTexto()} (usá esto para entender "mañana", "el viernes", etc. Las fechas para agendar van en formato YYYY-MM-DD).

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
      const elegidas = encontrados.slice(0, 2); // hasta 2 fotos
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
      .flatMap((a) => a.resultado.fotos.map((f) => f.img))
      .filter(Boolean);
    return { texto: (msg.content || "").trim(), acciones, imagenesEnviar };
  }
  return { texto: "Disculpá, se me complicó procesar eso. ¿Lo podés repetir o preferís que te pase con un asesor?", acciones, imagenesEnviar: [] };
}
