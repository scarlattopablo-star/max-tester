// CUBREASIENTOS EN STOCK QUE NO ESTÁN EN MERCADO LIBRE (o que ML muestra sin stock).
//
// Pedido de Pablo (19 nov 2026): el local tiene cubreasientos armados para estos
// vehículos, pero en Mercado Libre no están publicados o figuran sin stock. Sin esta
// lista Max contestaba "de momento no tenemos cubreasientos para ese vehículo" (la
// regla del 15 oct) y se perdía la venta.
// Para estos autos Max dice que SÍ HAY y deriva DIRECTO a un asesor, que le informa
// bien modelos, colores y precio. ⛔ Max NO da precio de esta lista.
//
// Fuente: la hoja impresa que mandó Pablo. El precio quedó anotado para el equipo
// (lo ven en la derivación), tal cual la hoja: "base + adicional".
// ✏️ Para sumar o sacar un auto, editá esta lista (y avisá: hay que hacer deploy).
//
// `re` se prueba contra el texto en minúsculas y sin acentos. Solo se usa cuando la
// consulta YA es de cubreasientos, así que alcanza con el nombre del modelo — salvo
// los que también son palabras comunes o años, que piden la marca al lado.
export const STOCK_SIN_PUBLICAR = [
  { auto: "Renault Clio", re: /\bclio\b/, precio: "10900 + 2000" },
  { auto: "Volkswagen Suran", re: /\bsuran\b/, precio: "10900 + 2000" },
  { auto: "Volkswagen Virtus", re: /\bvirtus\b/, precio: "10900 + 2000" },
  { auto: "Kia Rio", re: /\bkia\s+rio\b/, precio: "10900 + 2000" },
  { auto: "Kia Sportage", re: /\bsportage\b/, precio: "12900 + 2000" },
  { auto: "Renault Kardian", re: /\bkardian\b/, precio: "12900 + 2000" },
  { auto: "Chevrolet Corsa", re: /\bcorsa\b/, precio: "10900 + 2000" },
  { auto: "Fiat Palio", re: /\bpalio\b/, precio: "10900 + 2000" },
  { auto: "Fiat Argo", re: /\bargo\b/, precio: "10900 + 2000" },
  { auto: "Citroën C4 Cactus", re: /\bcactus\b/, precio: "10900 + 2000" },
  { auto: "Citroën C3 Aircross", re: /\bair\s?cross\b/, precio: "12900 + 2000" },
  { auto: "Peugeot 2008", re: /\bpeugeot\s+2008\b/, precio: "10900 + 2000" },
  { auto: "Suzuki Baleno", re: /\bbaleno\b/, precio: "10900 + 2000" },
  { auto: "Chevrolet Prisma", re: /\bprisma\b|\bchevrolet+\s+prima\b/, precio: "10900 + 1000" },
  { auto: "Chevrolet Joy", re: /\bjoy\b/, precio: "10900 + 1000" },
  { auto: "Chevrolet Aveo", re: /\baveo\b/, precio: "10900 + 2000" },
  { auto: "Chevrolet Agile", re: /\bagile\b/, precio: "10900 + 2000" },
  { auto: "Hyundai Grand i10", re: /\bgrand\s+i\s?10\b/, precio: "10900 + 2000" },
  { auto: "Hyundai i10", re: /\bi\s?10\b/, precio: "10900 + 1000" },
  { auto: "Chevrolet Tracker", re: /\btracker\b/, precio: "12900 + 4000" },
  { auto: "Chery QQ", re: /\bqq\b/, precio: "10900 + 1000" },
  { auto: "BYD F0", re: /\bf0\b/, precio: "10900 + 1000" },
  { auto: "Chery Fulwin", re: /\bful+win\b/, precio: "10900 + 2000" },
  { auto: "Peugeot 301", re: /\b301\b/, precio: "10900 + 2000", nota: "NO TAXI" },
  { auto: "Citroën C-Elysée", re: /\bel[iy]see\b/, precio: "10900 + 2000", nota: "NO TAXI" },
  { auto: "Fiat Cronos", re: /\bcronos?\b/, precio: "10900 + 2000" },
  { auto: "Ford EcoSport", re: /\beco\s?sport\b/, precio: "10900 + 2000" },
  { auto: "Ford Fiesta", re: /\bfiesta\b/, precio: "10900 + 2000" },
  { auto: "Kia K3 Cross", re: /\bk3\s+cross\b/, precio: "11900 + 2000" },
  { auto: "Kia K3", re: /\bk3\b/, precio: "11900 + 2000" },
  { auto: "Kia Picanto", re: /\bpicanto\b/, precio: "10900 + 1000" },
  { auto: "Nissan March", re: /\bmarch\b/, precio: "10900 + 1000" },
  { auto: "Renault Logan", re: /\blogan\b/, precio: "10900 + 2000" },
  { auto: "Renault Stepway", re: /\bstepway\b/, precio: "10900 + 2000" },
];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** ¿El texto nombra un vehículo de la lista? Devuelve la entrada o null. */
export function stockSinPublicar(texto) {
  const t = norm(texto);
  if (!t.trim()) return null;
  return STOCK_SIN_PUBLICAR.find((e) => e.re.test(t)) || null;
}

/** Lo que ve el EQUIPO en la derivación (con el precio de la hoja). */
export function resumenParaEquipo(e) {
  return `Cliente que preguntó por CUBREASIENTOS para ${e.auto}: está en la LISTA DE STOCK SIN PUBLICAR (hay en el local aunque Mercado Libre no lo muestre). Max le dijo que hay y que lo pasaba con un asesor, SIN precio. Precio en la hoja: ${e.precio}.${e.nota ? ` ⚠️ La hoja dice ${e.nota}: confirmá que no sea taxi.` : ""} Informale vos modelos, colores y precio.`;
}
