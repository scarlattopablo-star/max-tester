// CUBREASIENTOS EN STOCK QUE NO ESTÁN EN MERCADO LIBRE (o que ML muestra sin stock).
//
// Pedido de Pablo (19 nov 2026): el local tiene cubreasientos armados para estos
// vehículos, pero en Mercado Libre no están publicados o figuran sin stock. Sin esta
// lista Max contestaba "de momento no tenemos cubreasientos para ese vehículo" (la
// regla del 15 oct) y se perdía la venta.
// Para estos autos Max dice que SÍ HAY y deriva DIRECTO a un asesor, que le informa
// bien modelos, colores y precio. ⛔ Max NO da precio de esta lista.
//
// Fuente: la hoja impresa que mandó Pablo. ⛔ Los números de la hoja NO se usan
// (pedido de Pablo, 19 nov 2026): ni Max ni la derivación llevan precio.
// ✏️ Para sumar o sacar un auto, editá esta lista (y avisá: hay que hacer deploy).
//
// `re` se prueba contra el texto en minúsculas y sin acentos. Solo se usa cuando la
// consulta YA es de cubreasientos, así que alcanza con el nombre del modelo — salvo
// los que también son palabras comunes o años, que piden la marca al lado.
export const STOCK_SIN_PUBLICAR = [
  { auto: "Renault Clio", re: /\bclio\b/ },
  { auto: "Volkswagen Suran", re: /\bsuran\b/ },
  { auto: "Volkswagen Virtus", re: /\bvirtus\b/ },
  { auto: "Kia Rio", re: /\bkia\s+rio\b/ },
  { auto: "Kia Sportage", re: /\bsportage\b/ },
  { auto: "Renault Kardian", re: /\bkardian\b/ },
  { auto: "Chevrolet Corsa", re: /\bcorsa\b/ },
  { auto: "Fiat Palio", re: /\bpalio\b/ },
  { auto: "Fiat Argo", re: /\bargo\b/ },
  { auto: "Citroën C4 Cactus", re: /\bcactus\b/ },
  { auto: "Citroën C3 Aircross", re: /\bair\s?cross\b/ },
  { auto: "Peugeot 2008", re: /\bpeugeot\s+2008\b/ },
  { auto: "Suzuki Baleno", re: /\bbaleno\b/ },
  { auto: "Chevrolet Prisma", re: /\bprisma\b|\bchevrolet+\s+prima\b/ },
  { auto: "Chevrolet Joy", re: /\bjoy\b/ },
  { auto: "Chevrolet Aveo", re: /\baveo\b/ },
  { auto: "Chevrolet Agile", re: /\bagile\b/ },
  { auto: "Hyundai Grand i10", re: /\bgrand\s+i\s?10\b/ },
  { auto: "Hyundai i10", re: /\bi\s?10\b/ },
  { auto: "Chevrolet Tracker", re: /\btracker\b/ },
  { auto: "Chery QQ", re: /\bqq\b/ },
  { auto: "BYD F0", re: /\bf0\b/ },
  { auto: "Chery Fulwin", re: /\bful+win\b/ },
  { auto: "Peugeot 301", re: /\b301\b/, nota: "NO TAXI" },
  { auto: "Citroën C-Elysée", re: /\bel[iy]see\b/, nota: "NO TAXI" },
  { auto: "Fiat Cronos", re: /\bcronos?\b/ },
  { auto: "Ford EcoSport", re: /\beco\s?sport\b/ },
  { auto: "Ford Fiesta", re: /\bfiesta\b/ },
  { auto: "Kia K3 Cross", re: /\bk3\s+cross\b/ },
  { auto: "Kia K3", re: /\bk3\b/ },
  { auto: "Kia Picanto", re: /\bpicanto\b/ },
  { auto: "Nissan March", re: /\bmarch\b/ },
  { auto: "Renault Logan", re: /\blogan\b/ },
  { auto: "Renault Stepway", re: /\bstepway\b/ },
];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** ¿El texto nombra un vehículo de la lista? Devuelve la entrada o null. */
export function stockSinPublicar(texto) {
  const t = norm(texto);
  if (!t.trim()) return null;
  return STOCK_SIN_PUBLICAR.find((e) => e.re.test(t)) || null;
}

/** Lo que ve el EQUIPO en la derivación (sin precio). */
export function resumenParaEquipo(e) {
  return `Cliente que preguntó por CUBREASIENTOS para ${e.auto}: está en la LISTA DE STOCK SIN PUBLICAR (hay en el local aunque Mercado Libre no lo muestre). Max le dijo que hay y que lo pasaba con un asesor, SIN precio.${e.nota ? ` ⚠️ La hoja dice ${e.nota}: confirmá que no sea taxi.` : ""} Informale vos modelos, colores y precio.`;
}
