// Datos fijos del negocio. Un solo lugar para editarlos.
// Nombre humano del asistente (como "Sofi" en Buda Accesorios).
export const ASISTENTE = "Max";

export const NEGOCIO = {
  nombre: "La Casa del Cubreasiento",
  direccion: "Paysandú 944, esquina Río Branco, Montevideo, Uruguay",
  telefonoFijo: "2 901 55 88",
  whatsappHumano: "091 629 784", // número PRINCIPAL (humano) al que derivamos desde Instagram
  whatsappHumanoIntl: "59891629784", // para armar el link wa.me
  email: "ventas@lacasadelcubreasiento.com.uy",
  web: "https://lacasadelcubreasiento.com.uy",
  facebook: "https://facebook.com/lacasadelcubreasiento",
  instagram: "@lacasadelcubreasiento",
  horario: "Lunes a viernes de 9:00 a 18:00 hs. Sábados y domingos cerrado.",
  enviosTodoElPais: true,
  mediosPago: ["Tarjetas de crédito/débito", "Mercado Pago", "Transferencia bancaria", "Efectivo en el local"],
  descuentoTransferencia: 10, // % de descuento si paga por transferencia
  // DATOS DE COBRO que Max le comparte al cliente cuando quiere pagar.
  // Completá estos campos (dejá "" lo que no tengas). Si están vacíos, Max coordina con un humano.
  datosCobro: {
    transferencia: "", // ej: "Banco Itaú, caja de ahorro $ 1234567, a nombre de La Casa del Cubreasiento" (o alias)
    mercadoPagoAlias: "", // alias o CVU de Mercado Pago para transferir
    mercadoPagoLink: "", // link de pago para tarjetas (lo generás en tu cuenta de Mercado Pago)
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
    model: "claude-sonnet-4-6",
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
