// Prueba la regla pedida por Pablo el 2 ago 2026: cuando un producto está PAUSADO
// o sin stock en Mercado Libre, Max ya no deriva a un asesor — dice que se agotó y
// ofrece avisar cuando llegue. Y cuando el producto NO existe en ML, dice que no
// trabajamos ese modelo (salvo cubreasientos y JMC, que siguen derivando).
//
// No toca Mercado Libre, ni Meta, ni la base: arma un catálogo de prueba en memoria.
// Corre con: node test_esperas.mjs
//
// ⚠️ CATALOGO_SIN_DISCO va ANTES de los imports: sin esto, el catálogo de juguete se
// persiste y PISA el snapshot real de src/productos_ml.json (ya pasó una vez).
process.env.CATALOGO_SIN_DISCO = "1";
import { actualizarCatalogo, agotadoPorId, estaDisponible, agotados } from "./src/catalogo_vivo.js";
import { buscarPrecio, buscarAgotado, sinStockOInexistente } from "./src/cerebro.js";
import { hayEsperas } from "./src/esperas.js";

let ok = 0, mal = 0;
function caso(nombre, pasa, detalle = "") {
  console.log(pasa ? `✅ ${nombre}` : `❌ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  pasa ? ok++ : mal++;
}

// ── Catálogo de prueba ───────────────────────────────────────────────────
// Activo: alfombra de Hilux. Agotado: alfombra de Nivus (pausada en ML).
const ACTIVOS = [
  { id: "MLU111", n: "Alfombra Bandeja 3D Toyota Hilux", p: 3500, img: "https://x/hilux.jpg" },
  { id: "MLU222", n: "Cubre Volante Cuero Negro", p: 900, img: "https://x/volante.jpg" },
];
const AGOTADOS = [
  { id: "MLU333", n: "Alfombra Bandeja 3D Volkswagen Nivus", img: "https://x/nivus.jpg", motivo: "pausada" },
];
actualizarCatalogo(ACTIVOS, "test", AGOTADOS);

// ── 1) El producto agotado se reconoce como agotado, no como inexistente ──
const r1 = sinStockOInexistente("alfombra nivus");
caso("alfombra pausada → agotado: true", r1.agotado === true, JSON.stringify(r1));
caso("agotado devuelve el id de la publicación", r1.producto_id === "MLU333", r1.producto_id);
caso("el mensaje le prohíbe derivar", /NO derives/i.test(r1.mensaje || ""));

// ── 2) El producto que no existe NO ofrece aviso ─────────────────────────
const r2 = sinStockOInexistente("alfombra ferrari testarossa");
caso("producto inexistente → agotado: false", r2.agotado === false, JSON.stringify(r2));
caso("inexistente no trae producto_id", !r2.producto_id);
caso("el mensaje distingue cubreasientos y JMC", /cubreasiento/i.test(r2.mensaje || "") && /jmc/i.test(r2.mensaje || ""));

// ── 3) Lo activo se sigue vendiendo normal (no cae en el camino de agotado) ──
const r3 = buscarPrecio("alfombra hilux");
caso("la alfombra activa se encuentra en el catálogo", r3.length > 0 && r3[0].id === "MLU111", JSON.stringify(r3[0] || {}));
caso("un producto activo NO aparece como agotado", buscarAgotado("alfombra hilux") === null);

// ── 4) Los agotados NUNCA se ofrecen como si estuvieran a la venta ───────
caso("el agotado no está en el catálogo de venta", buscarPrecio("alfombra nivus").length === 0);
caso("la lista de agotados quedó cargada", agotados().length === 1);

// ── 5) Estado de una publicación por id (lo usa el repaso de esperas) ────
caso("estaDisponible reconoce lo activo", estaDisponible("MLU111") === true);
caso("estaDisponible dice que no del agotado", estaDisponible("MLU333") === false);
caso("agotadoPorId encuentra la publicación caída", agotadoPorId("MLU333")?.n?.includes("Nivus") === true);
caso("agotadoPorId rechaza un id inventado", agotadoPorId("MLU999") === null);

// ── 6) Cuando el producto vuelve, el repaso lo ve disponible ─────────────
actualizarCatalogo([...ACTIVOS, { id: "MLU333", n: "Alfombra Bandeja 3D Volkswagen Nivus", p: 3500, img: "https://x/nivus.jpg" }], "test", []);
caso("al reponerse, la publicación pasa a disponible", estaDisponible("MLU333") === true);
caso("y deja de figurar como agotada", buscarAgotado("alfombra nivus") === null);

// ── 7) Sin base de datos, Max NO puede prometer el aviso ────────────────
// (hayEsperas() es lo que la herramienta consulta antes de comprometerse).
caso(
  "hayEsperas refleja si hay base para anotar",
  hayEsperas() === !!process.env.DATABASE_URL,
  `hayEsperas=${hayEsperas()} DATABASE_URL=${!!process.env.DATABASE_URL}`
);

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
