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
// CUBREASIENTOS — dos líneas. Las reglas las usa el cerebro (cerebro.js).
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
    pespuntes: ["Rojo", "Azul", "Gris"],
    descripcion: "", // el económico NO necesita descripción extra del material
  },
  // Línea PREMIUM: capitoneado. SÍ se coloca (costo a consultar con vendedor).
  capitoneado: {
    nombre: "Cubreasiento capitoneado premium",
    colocacion: true,
    costoColocacion: "se cotiza con un vendedor (consultar)",
    coloresCapitoneado: ["Negro", "Rojo"],
    logoOpcional: true,
    coloresLogo: ["Rojo", "Negro", "Gris", "Azul"],
    // Fotos REALES de muestra del material (en public/capitoneado/). URLs absolutas
    // para que funcionen tanto en el tester web como en WhatsApp.
    muestras: {
      negro: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/negro.jpg`,
      rojo: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/rojo.jpg`,
      detalle: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/detalle.jpg`, // ambos colores + espuma a la vista
      espuma: `${process.env.APP_URL || "https://max-tester.onrender.com"}/capitoneado/espuma.jpg`, // grosor de espuma 8mm
    },
    // Descripción del material (Max la da DESPUÉS de que el cliente elige el capitoneado).
    // Son los puntos de venta del cuero ecológico capitoneado. Max NO los recita de
    // corrido: los explica de a poco, en una charla amena (ver reglas en cerebro.js).
    descripcion: [
      "Cubreasientos premium en cuero ecológico capitoneado, de alta gama, pensados para renovar y proteger el interior del vehículo con máxima protección, confort y elegancia.",
      "Cuero ecológico premium de excelente calidad.",
      "Capitoneado de lujo con espuma de alta densidad de 8 mm.",
      "100% impermeables.",
      "Lavables y de fácil mantenimiento.",
      "Material resistente al desgaste y al uso diario.",
      "Costuras reforzadas y terminaciones premium.",
      "Protegen los asientos originales conservando el valor de reventa del vehículo.",
      "Diseño elegante y moderno, con excelente presentación.",
      "Materiales importados directamente por la empresa, seleccionados para garantizar mayor durabilidad, resistencia y una terminación superior.",
      "Garantía de 1 año por defectos de fabricación.",
      "Combinan protección, confort y estilo: son la opción ideal para mantener el interior del vehículo impecable y con una apariencia exclusiva.",
    ],
  },
};

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
    model: "claude-sonnet-5", // Sonnet 5: mucho más inteligente que Haiku; con caché de prompt sigue costando centavos por chat
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
