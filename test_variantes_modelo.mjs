// Caso real del 3 ago 2026: un cliente pidió alfombra para un BYD Yuan PRO, no
// había, y Max le ofreció una bandeja del Yuan PLUS. Son autos DISTINTOS: los
// productos no son intercambiables y ofrecer el de otro modelo le hace dudar al
// cliente de que le calce (y termina en devolución).
//
// También prueba el orden del mensaje de agotado que pidió el dueño:
//   1) ahora no hay  2) nos llegan en los próximos días  3) ¿querés que te avise?
//
// Corre con: node test_variantes_modelo.mjs   (usa la IA real y el catálogo real)
process.env.CATALOGO_SIN_DISCO = "1";
import { buscarPrecio, buscarAgotado, responder } from "./src/cerebro.js";
import { productos, agotados } from "./src/catalogo_vivo.js";

let ok = 0, mal = 0;
function caso(nombre, pasa, detalle = "") {
  console.log(pasa ? `✅ ${nombre}` : `❌ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  pasa ? ok++ : mal++;
}

// ── Guardas de datos: si el catálogo cambió, el test avisa en vez de mentir ──
const hayPlus = [...productos(), ...agotados()].some((p) => /yuan plus/i.test(p.n));
const hayPro = [...productos(), ...agotados()].some((p) => /yuan pro/i.test(p.n));
if (!hayPlus || !hayPro) {
  console.log("⚠ El catálogo ya no tiene Yuan Pro y Yuan Plus a la vez: este test no puede probar nada. Revisalo.");
  process.exit(0);
}

// ── 1) La búsqueda nunca cruza variantes ──────────────────────────────────
for (const q of ["alfombra yuan pro", "alfombra byd yuan pro", "cubreasiento yuan pro"]) {
  const cruzado = buscarPrecio(q).filter((x) => /plus/i.test(x.nombre));
  caso(`"${q}" no devuelve ningún PLUS`, cruzado.length === 0, cruzado.map((x) => x.nombre).join(" | "));
}
const agoPro = buscarAgotado("alfombra yuan pro");
caso("el agotado del Yuan Pro es del Yuan Pro", !!agoPro && /yuan pro/i.test(agoPro.nombre) && !/plus/i.test(agoPro.nombre), agoPro?.nombre || "(nada)");

// Y al revés, para no haber roto el Plus.
const agoPlus = buscarAgotado("alfombra yuan plus");
caso("el agotado del Yuan Plus sigue siendo del Plus", !!agoPlus && /plus/i.test(agoPlus.nombre), agoPlus?.nombre || "(nada)");

// ── 2) La conversación real ───────────────────────────────────────────────
const saludo = [{ role: "assistant", content: "Buenas tardes, ¿cómo estás? Max de La Casa del Cubreasiento. ¿En qué te puedo ayudar?" }];
const r = await responder("hola, tenés alfombras para el byd yuan pro?", saludo, [], { canal: "test", chatId: "test-var-" + Math.random() });
const resp = r.texto || "";
const captions = (r.imagenesEnviar || []).map((f) => f.caption || "").join(" | ");
console.log(`\n--- Conversación ---\nCliente: hola, tenés alfombras para el byd yuan pro?\nMax: ${resp}`);
if (captions) console.log(`Fotos: ${captions}`);

caso("no le nombra el Yuan PLUS al cliente", !/plus/i.test(resp + " " + captions), (resp + " " + captions).slice(0, 200));

// El mensaje de agotado lo pone el CÓDIGO (AVISO_AGOTADO), así sale siempre igual:
// tiene que aparecer TAL CUAL y una sola vez.
const { AVISO_AGOTADO } = await import("./src/config.js");
caso("manda el aviso oficial de agotado, palabra por palabra", resp.includes(AVISO_AGOTADO), resp.slice(0, 200));
caso("no lo manda dos veces", resp.split("¿Querés que te avise apenas llegue?").length === 2, resp.slice(0, 250));
caso("no inventa plazos", !/(en \d+ d[ií]as?|la semana que viene|el (lunes|martes|mi[eé]rcoles|jueves|viernes)|ma[ñn]ana)/i.test(resp), resp.slice(0, 200));

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
