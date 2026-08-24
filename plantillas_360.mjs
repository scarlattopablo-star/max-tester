// Alta y consulta de plantillas de WhatsApp en 360dialog.
//
// USO
//   node plantillas_360.mjs listar
//   node plantillas_360.mjs crear <nombre>
//   node plantillas_360.mjs borrar <nombre>
//
// ⚠️ SIEMPRE con Node, NUNCA con curl: en Windows curl rompe el encoding del
//    cuerpo y la plantilla queda aprobada con los acentos corruptos. Ya pasó
//    con `aviso_equipo`, que quedó quemada (el nombre no se puede reusar).
// ⚠️ Por eso mismo: probar primero con un nombre DESCARTABLE
//    (ej. `zz_prueba_preventa_1`), mirar cómo quedó el texto, y recién ahí
//    crear el nombre bueno. Un nombre usado no se recupera.
import "./src/env.js";

const BASE = "https://waba-v2.360dialog.io";
const KEY = process.env.D360_API_KEY || "";
if (!KEY) {
  console.error("Falta D360_API_KEY en .env");
  process.exit(1);
}

const H = { "D360-API-KEY": KEY, "Content-Type": "application/json" };

// Aviso de llegada de un producto que se vendió en PREVENTA. No sirve la
// plantilla `volvio_stock_max` ("volvió a estar disponible"): estas alfombras
// nunca estuvieron disponibles antes, así que esa frase suena a error.
//   {{1}} nombre del cliente
//   {{2}} producto (ej: "las alfombras 3D para Tesla")
const CUERPO =
  "¡Hola {{1}}! Llegaron {{2}} que estabas esperando en La Casa del Cubreasiento. " +
  "Te habías anotado en la preventa y te las guardamos. " +
  "¿Querés que te pase precio y coordinemos la entrega?";

function plantilla(nombre) {
  return {
    name: nombre,
    category: "UTILITY", // es el seguimiento de algo que el cliente pidió, no promoción
    language: "es",
    components: [
      {
        type: "BODY",
        text: CUERPO,
        example: { body_text: [["Rodrigo", "las alfombras 3D para Tesla"]] },
      },
      {
        type: "FOOTER",
        text: "Respondé BAJA si no querés recibir más avisos",
      },
    ],
  };
}

const cmd = process.argv[2];
const nombre = process.argv[3];

if (cmd === "listar") {
  const r = await fetch(`${BASE}/v1/configs/templates?limit=200`, { headers: H });
  const j = await r.json();
  if (!r.ok) {
    console.error("HTTP", r.status, JSON.stringify(j).slice(0, 500));
    process.exit(1);
  }
  for (const t of j.waba_templates || j.data || []) {
    const body = (t.components || []).find((c) => c.type === "BODY");
    console.log(`${(t.status || "?").padEnd(10)} ${t.name}  [${t.category || "?"}/${t.language || "?"}]`);
    if (body?.text) console.log(`            ${body.text.replace(/\n/g, " ").slice(0, 150)}`);
  }
} else if (cmd === "crear") {
  if (!nombre) {
    console.error("Falta el nombre. Usá uno DESCARTABLE la primera vez.");
    process.exit(1);
  }
  const body = plantilla(nombre);
  console.log("Cuerpo que se va a mandar:");
  console.log(CUERPO);
  console.log("");
  const r = await fetch(`${BASE}/v1/configs/templates`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const j = await r.json();
  console.log("HTTP", r.status);
  console.log(JSON.stringify(j, null, 2).slice(0, 1200));
} else if (cmd === "borrar") {
  const r = await fetch(`${BASE}/v1/configs/templates/${encodeURIComponent(nombre)}`, {
    method: "DELETE",
    headers: H,
  });
  console.log("HTTP", r.status, await r.text());
} else {
  console.log("Usá: listar | crear <nombre> | borrar <nombre>");
}
