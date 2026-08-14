// Datos fijos del negocio. Un solo lugar para editarlos.
// Nombre humano del asistente (como "Sofi" en Buda Accesorios).
export const ASISTENTE = "Max";

export const NEGOCIO = {
  nombre: "La Casa del Cubreasiento",
  direccion: "Paysandú 944, esquina Río Branco, Montevideo, Uruguay",
  ubicacionGoogle: "https://maps.google.com/?q=-34.9026396,-56.1965533", // ubicación para enviar al cliente
  telefonoFijo: "2 901 55 88",
  whatsappHumano: "091 629 784", // número PRINCIPAL (humano) al que derivamos desde Instagram
  whatsappHumanoIntl: "59891629784", // para armar el link wa.me
  email: "ventas@lacasadelcubreasiento.com.uy",
  web: "https://lacasadelcubreasiento.com.uy",
  facebook: "https://facebook.com/lacasadelcubreasiento",
  instagram: "@lacasadelcubreasiento",
  horario: "Lunes a viernes de 9:00 a 17:45 hs. Sábados y domingos cerrado.",
  enviosTodoElPais: true,
  mediosPago: ["Tarjetas Visa, OCA y Master (hasta 6 pagos)", "Mercado Pago", "Transferencia bancaria (10% de descuento)", "Efectivo en el local"],
  descuentoTransferencia: 10, // % de descuento si paga por transferencia
  // DATOS DE COBRO que Max le comparte al cliente cuando quiere pagar.
  // Completá estos campos (dejá "" lo que no tengas). Si están vacíos, Max coordina con un humano.
  datosCobro: {
    transferencia: "Banco Itaú, cuenta Nº 5022900, a nombre de Everbox SA",
    mercadoPagoAlias: "", // alias o CVU de Mercado Pago (cargar si lo querés)
    mercadoPagoLink: "", // link de pago para tarjetas (lo generás en tu cuenta de Mercado Pago)
  },
};

// ───────────────────────────────────────────────────────────────────
// ENVÍOS — se hacen ÚNICAMENTE por DAC (agencia de encomiendas).
// Para coordinar un envío Max pide: nombre completo, teléfono y dirección.
// ───────────────────────────────────────────────────────────────────
export const ENVIOS = {
  empresa: "DAC",
  detalle: "Los envíos se realizan únicamente por DAC (agencia de encomiendas), a todo el país.",
  datosNecesarios: ["nombre completo", "teléfono", "dirección"],
};

// Tienda en Mercado Libre del negocio (vendedor Everbox, sellerId 164590340).
// Link para listar TODOS los artículos del vendedor que matchean un modelo de auto.
export const SELLER_ML_ID = "164590340";
export const tiendaMLPorModelo = (modelo) =>
  `https://listado.mercadolibre.com.uy/${encodeURIComponent(String(modelo || "").trim().replace(/\s+/g, "-"))}_CustId_${SELLER_ML_ID}`;

// ───────────────────────────────────────────────────────────────────
// CUBREASIENTOS — tres líneas. Las reglas las usa el cerebro (cerebro.js).
// ───────────────────────────────────────────────────────────────────
export const CUBREASIENTOS = {
  // Línea ECONÓMICA: eco cuero. SOLO VENTA (no se coloca).
  economico: {
    nombre: "Cubreasiento eco cuero",
    material: "eco cuero",
    precioDesde: 6500,
    precioHasta: 6800,
    soloVenta: true,
    colocacion: false,
    // El eco cuero económico NO tiene variación de color de material: es SIEMPRE
    // cuero ecológico NEGRO. Lo único que varía es el color del PESPUNTE (costura).
    colorUnico: "Cuero ecológico negro",
    // Costuras REALES con foto (Pablo, 22 jul 2026): ocre (no decir "naranja"), azul y blanca.
    pespuntes: ["Ocre", "Azul", "Blanco"],
    // Fotos reales de las costuras: Max las muestra SIEMPRE que preguntan por
    // colores o al describir el eco cuero (tool mostrar_ecocuero).
    muestras: {
      costuraOcre: `${process.env.APP_URL || "https://max-tester.onrender.com"}/ecocuero/costura-ocre.jpg`,
      costuraAzul: `${process.env.APP_URL || "https://max-tester.onrender.com"}/ecocuero/costura-azul.jpg`,
      costuraBlanca: `${process.env.APP_URL || "https://max-tester.onrender.com"}/ecocuero/costura-blanca.jpg`,
    },
    descripcion: "", // el económico NO necesita descripción extra del material
  },
  // Línea PREMIUM: capitoneado. SÍ se coloca (costo a consultar con vendedor).
  capitoneado: {
    nombre: "Cubreasiento capitoneado premium",
    colocacion: true,
    costoColocacion: "se cotiza con un vendedor (consultar)",
    // ⚠️ Las costuras ocre/azul/blanca valen para el capitoneado Y para el eco
    // cuero (Pablo, 22 jul 2026). "Ocre", nunca "naranja".
    coloresCapitoneado: ["Negro", "Rojo", "Negro con costura ocre", "Negro con costura azul", "Negro con costura blanca"],
    logoOpcional: true,
    coloresLogo: ["Rojo", "Negro", "Gris", "Azul"],
    // Fotos REALES de muestra del material (en public/capitoneado/). URLs absolutas
    // para que funcionen tanto en el tester web como en WhatsApp.
    muestras: {
      negro: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/negro.jpg`,
      rojo: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/rojo.jpg`,
      negroOcre: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/negro-naranja.jpg`, // costura OCRE (archivo con nombre viejo)
      negroAzul: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/negro-azul.jpg`,
      negroBlanco: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/negro-blanco.jpg`,
      detalle: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/detalle.jpg`, // ambos colores + espuma a la vista
      espuma: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/espuma.jpg`, // grosor de espuma 8mm
    },
    // Descripción OFICIAL del cuero ecológico capitoneado (los puntos de venta de
    // siempre, en bloque textual — Pablo pidió el 22 jul 2026 que Max la dé TAL CUAL
    // cuando el cliente elige el capitoneado o pregunta por el material).
    descripcionExacta: `Cubreasientos premium en cuero ecológico capitoneado, de alta gama, pensados para renovar y proteger el interior del vehículo con máxima protección, confort y elegancia.

✅ Cuero ecológico premium de excelente calidad.
✅ Capitoneado de lujo con espuma de alta densidad de 8 mm.
✅ 100% impermeables.
✅ Lavables y de fácil mantenimiento.
✅ Material resistente al desgaste y al uso diario.
✅ Costuras reforzadas y terminaciones premium.
✅ Protegen los asientos originales conservando el valor de reventa del vehículo.
✅ Diseño elegante y moderno, con excelente presentación.
✅ Materiales importados directamente por la empresa, seleccionados para garantizar mayor durabilidad, resistencia y una terminación superior.
✅ Garantía de 1 año por defectos de fabricación.

Combinan protección, confort y estilo: son la opción ideal para mantener el interior del vehículo impecable y con una apariencia exclusiva.`,
  },
  // Línea TELA: a medida en tela de tapicería capitoneada de 8 mm. El precio final
  // depende del modelo, así que la cotización la cierra SIEMPRE un asesor: Max la
  // ofrece con el video real, junta marca/modelo/año y deriva.
  tela: {
    nombre: "Cubreasiento a medida en tela de tapicería capitoneada",
    precioDesde: 9500,
    precioHasta: 12500,
    // SÍ se coloca (Pablo, 28 jul 2026). El costo va aparte y lo cotiza un vendedor.
    colocacion: true,
    costoColocacion: "se cotiza con un vendedor (consultar)",
    video: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/tela.mp4`,
    // Descripción OFICIAL del negocio (Pablo, 22 jul 2026): Max la envía TAL CUAL,
    // sin cambiar una palabra, cuando el cliente se interesa por esta línea.
    descripcionExacta: `Trabajamos con cubreasientos a medida confeccionados en tela de tapicería capitoneada de 8 mm de alta densidad, con materiales de máxima calidad, excelente terminación y gran durabilidad.

✅ Diseño exclusivo y elegante.
✅ Espuma de 8 mm de alta densidad para mayor confort.
✅ Material resistente al uso diario.
✅ Excelente ajuste según el modelo de tu vehículo.
✅ Gran durabilidad y terminaciones premium.

💰 Precio: entre $9.500 y $12.500, dependiendo del modelo del vehículo.

📲 Para poder cotizarte correctamente, por favor indicanos:

Marca
Modelo
Año del vehículo`,
  },
  // Línea SPORT: premium en cuero automotriz Sport, a medida de cada vehículo.
  // Igual que la tela: el precio exacto lo da un asesor (Max muestra fotos + video,
  // junta marca/modelo/año y deriva).
  sport: {
    nombre: "Cubreasiento premium en cuero automotriz Sport",
    precioDesde: 18000,
    precioHasta: 22000,
    // SÍ se coloca (Pablo, 28 jul 2026). El costo va aparte y lo cotiza un vendedor.
    colocacion: true,
    costoColocacion: "se cotiza con un vendedor (consultar)",
    video: `${process.env.APP_URL || "https://max-tester.onrender.com"}/sport/video.mp4`,
    // Fotos de TRABAJOS REALES instalados (camioneta JMC, jul 2026). Pablo pidió
    // (23 jul 2026) mostrar SOLO estas — las viejas cuero-1/cuero-2 no van más.
    fotos: [
      `${process.env.APP_URL || "https://max-tester.onrender.com"}/sport/instalado-1.jpg`,
      `${process.env.APP_URL || "https://max-tester.onrender.com"}/sport/instalado-2.jpg`,
      `${process.env.APP_URL || "https://max-tester.onrender.com"}/sport/instalado-3.jpg`,
    ],
    // Descripción OFICIAL del negocio (Pablo, 22 jul 2026): Max la envía TAL CUAL,
    // sin cambiar una palabra, cuando el cliente se interesa por esta línea.
    descripcionExacta: `Contamos con una línea Premium en cuero automotriz Sport, confeccionada a medida para cada vehículo.

✅ Cuero automotriz Sport de máxima calidad.
✅ Espumas de 8 mm de alta densidad para mayor confort.
✅ Impermeables y lavables.
✅ Máxima resistencia y durabilidad.
✅ Excelente terminación y ajuste específico para cada modelo.

💰 Precio: entre $18.000 y $22.000, dependiendo del modelo del vehículo.

Si esta opción es de su interés, por favor indíquenos la marca, modelo y año de su vehículo. Un asesor de ventas se comunicará con usted a la brevedad para brindarle el precio exacto y toda la información que necesite.`,
  },
};

// ───────────────────────────────────────────────────────────────────
// AVISO DE COLOCACIÓN — texto EXACTO que el CÓDIGO agrega al cerrar la
// venta de un cubreasiento COLOCABLE (capitoneado, tela y Sport; el eco
// cuero es solo venta). Pedido de Pablo el 28 jul 2026: el cliente llegaba
// al local sin turno confirmado. Lo manda el código, NO el modelo, para que
// salga SIEMPRE palabra por palabra. Si Pablo cambia el texto, se edita acá.
// ───────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────
// AVISO DE ENVÍO — texto EXACTO que el CÓDIGO agrega al cerrar una venta
// que va POR ENVÍO. Pedido de Pablo (14 ago 2026): el cliente tiene que
// saber cuándo se despacha antes de quedarse esperando.
// Lo manda el código, NO el modelo, para que el plazo salga siempre igual
// (un plazo inventado por la IA es una promesa que el negocio no hizo).
// Si Pablo cambia el plazo, se edita ACÁ y listo.
//
// ⚠️ El plazo es el del DESPACHO, no el de la entrega: el pedido SALE dentro
// de los 2 o 3 días. Lo que tarde DAC después va por cuenta de la agencia y
// el negocio no lo promete. Cuidado al reescribir este texto: decir "llega en
// 2 o 3 días" es prometer algo distinto (y que no depende de la casa).
// ───────────────────────────────────────────────────────────────────
export const AVISO_ENVIO = `Sobre el ENVÍO:

• Lo mandamos por DAC (agencia de encomiendas), a todo el país.
• El pedido se despacha dentro de los 2 o 3 días.`;

export const AVISO_COLOCACION = `Importante sobre la COLOCACIÓN:

• La colocación NO está incluida en el precio del cubreasiento: se cotiza y se abona aparte.
• El día y la hora se coordinan con el equipo y quedan sujetos a disponibilidad de agenda.
• Recién cuando el equipo te confirme la fecha y la hora podés acercarte al local. Por favor no vengas antes de tener esa confirmación, porque sin el turno confirmado no vamos a poder hacerte la colocación.`;

// ───────────────────────────────────────────────────────────────────
// PRODUCTO AGOTADO — pedido de Pablo (3 ago 2026): "es importante que sea algo así
// el mensaje SIEMPRE". Cuando la publicación existe en Mercado Libre pero está
// pausada o sin stock, Max manda ESTE texto, palabra por palabra, y después espera
// la respuesta del cliente. Si el cliente dice que sí, se anota la espera y cuando
// el producto vuelve el sistema le escribe solo.
// ✏️ Para cambiar cómo se lo dice a los clientes, se edita ACÁ y nada más.
// ⛔ Sin fechas ni plazos concretos: no los sabemos y el cliente los reclama.
export const AVISO_AGOTADO = `Actualmente está agotado, no tenemos en stock. Estamos esperando que reingrese stock.

¿Querés que te avise apenas llegue?`;

// ───────────────────────────────────────────────────────────────────
// LO QUE **NO** HACEMOS — pedido de Pablo (31 jul 2026): "Max no puede inventar".
// Max le dijo a un cliente que le podíamos hacer una ALFOMBRA A MEDIDA. Eso NO
// existe: La Casa del Cubreasiento no fabrica alfombras a pedido. Todo lo que
// esté en esta lista, Max lo dice con sinceridad (no lo ofrece nunca) y, si el
// cliente igual lo necesita, deriva a un asesor.
// ⚠️ Esta lista es de cosas CONFIRMADAS que no hacemos. Lo que NO figura acá ni
// en el prompt ni lo devuelven las herramientas, Max NO lo afirma ni lo niega:
// lo consulta con un asesor (regla "PROHIBIDO INVENTAR" en cerebro.js).
// Para sumar un caso nuevo: agregá una línea acá (la lee el prompt solo).
// ───────────────────────────────────────────────────────────────────
export const NO_HACEMOS = [
  "ALFOMBRAS a medida, a pedido, cortadas o adaptadas: NO existen. Las alfombras son ÚNICAMENTE las que están publicadas en el catálogo (vienen moldeadas por modelo de vehículo). Si para el vehículo del cliente no aparece ninguna, no hay: lo verifica un asesor.",
  "CUBRE VOLANTES a medida: no se fabrican a pedido. Vienen por MARCA, en las medidas ya definidas.",
  "COLOCACIÓN de alfombras, cubre volantes, cubreautos, accesorios y del cubreasiento eco cuero económico: esos productos NO se colocan (solo se venden).",
];

// Frase para cuando Max no puede resolver algo o no está seguro: la dice y deriva.
export const FRASE_CONSULTO = "Dejame consultarlo con un asesor así te confirmo bien; enseguida se comunican con vos.";

// Link directo a WhatsApp del humano (para derivar desde Instagram).
export const WA_LINK = `https://wa.me/${NEGOCIO.whatsappHumanoIntl}`;

// Horarios de turnos disponibles en el local (franjas). Editá a gusto.
export const FRANJAS_TURNO = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

// ───────────────────────────────────────────────────────────────────
// CEREBRO IA — proveedor configurable (todos hablan "estilo OpenAI").
// Cambiás de cerebro con la variable IA_PROVIDER en el .env.
//   gemini  -> GRATIS, solo tu Gmail (recomendado)   clave: GEMINI_API_KEY
//   groq    -> GRATIS, modelos Llama                 clave: GROQ_API_KEY
//   openai  -> pago (ChatGPT API)                    clave: OPENAI_API_KEY
//   claude  -> pago (Anthropic, compat OpenAI)       clave: ANTHROPIC_API_KEY
// ───────────────────────────────────────────────────────────────────
const PRESETS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.0-flash",
    envKey: "GEMINI_API_KEY",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    envKey: "GROQ_API_KEY",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
  },
  claude: {
    baseURL: "https://api.anthropic.com/v1/",
    model: "claude-sonnet-5", // Sonnet 5 (10-jul-2026): más inteligente, ~2-3x el costo de Haiku. OJO: comparte el límite mensual de Anthropic con Sofi/Juli — si se vuelve a tocar el tope, subir el límite en la Consola o volver a "claude-haiku-4-5-20251001".
    envKey: "ANTHROPIC_API_KEY",
  },
};

export function proveedorIA() {
  const nombre = (process.env.IA_PROVIDER || "gemini").toLowerCase();
  const preset = PRESETS[nombre] || PRESETS.gemini;
  return {
    nombre,
    baseURL: preset.baseURL,
    model: process.env.IA_MODEL || preset.model,
    apiKey: process.env[preset.envKey] || "",
    envKey: preset.envKey,
  };
}
