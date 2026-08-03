// El filtro que saca las palabras de adentro ("publicado", "en el catálogo") del
// mensaje al cliente. Va por código porque al modelo se le escapan igual aunque el
// prompt se lo prohíba. Corre sin red: node test_jerga_filtro.mjs
process.env.CATALOGO_SIN_DISCO = "1";
import { limpiarJerga } from "./src/cerebro.js";

let ok = 0, mal = 0;
function caso(entrada, esperado) {
  const salida = limpiarJerga(entrada);
  const pasa = salida === esperado;
  console.log(pasa ? `✅ ${salida}` : `❌ "${salida}"\n   esperaba: "${esperado}"`);
  pasa ? ok++ : mal++;
}

// Lo que Max decía mal (casos reales de las charlas del 2 y 3 de agosto).
caso("No tenemos alfombra publicada para el JMC EV4 por el momento.", "No tenemos alfombra disponible para el JMC EV4 por el momento.");
caso("Para la MG ZS no tengo alfombras publicadas.", "Para la MG ZS no tengo alfombras disponibles.");
caso("Justo ese modelo no lo tenemos registrado en el catálogo.", "Justo ese modelo no lo tenemos registrado.");
caso("No figura en nuestro sistema por ahora.", "No figura por ahora.");
caso("Esa no aparece en la lista.", "Esa no aparece.");

// Lo que NO se puede tocar.
caso("Justo esa la tenemos agotada, nos llegan nuevas en los próximos días.", "Justo esa la tenemos agotada, nos llegan nuevas en los próximos días.");
caso("Listo, quedás anotado: te escribo apenas entre.", "Listo, quedás anotado: te escribo apenas entre.");
caso("Tenemos alfombra bandeja 3D para tu Hilux, sale $3.500.", "Tenemos alfombra bandeja 3D para tu Hilux, sale $3.500.");

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
