// El "agotado" tiene que ser DEL PRODUCTO QUE PIDIÓ EL CLIENTE (28 ago 2026).
//
// Qué pasó: Max le contestó "Actualmente está agotado, no tenemos en stock" a gente
// que preguntaba por el CAPITONEADO —que se fabrica a medida y nunca se agota— y en
// dos charlas tuvo que meterse el equipo a desmentirlo ("perdón que el bot está dando
// fallas, tenemos sí en stock capitoneado negro", "perdón está mal cargado, tengo sí
// en stock"). Una de esas charlas terminó en venta de $11.900 colocado que Max había
// dado por perdida.
//
// La causa: buscarAgotado() usaba la MISMA búsqueda relajada que el catálogo de venta,
// donde la LÍNEA ("capitoneado", "tela", "neopreno"), el ACABADO ("3d", "5d", "goma")
// y el COLOR son palabras genéricas que se descartan. Así, la pregunta que contestaba
// no era "¿está agotado ESTO?" sino "¿hay alguna publicación pausada que hable de este
// auto (o de esta MARCA)?". Ejemplos reales de producción, todos del 28 ago:
//   · capitoneado negro para Fiat Palio  -> "Cubreasiento Fiat Palio Weekend Cuero Ecolgico ROJO"
//   · cubreasiento de tela Citroën AX    -> "Cubreasiento Citroen K9/b9 BERLINGO Delanteras"
//   · alfombra 3D para VW Gol G7         -> "Alfombra Bandeja 5D Vw Gol G5,g6,g7,g8"
//   · alfombra bandeja Strada Freedom    -> "Alfombra Fiat Strada 2022 Original 100% GOMA"
//
// Corre con: node test_agotado_producto_correcto.mjs   (no llama a la IA)
process.env.CATALOGO_SIN_DISCO = "1";
import { sinStockOInexistente, buscarPrecio } from "./src/cerebro.js";

let ok = 0, mal = 0;
function caso(nombre, { consulta, dijoElCliente = "", agotadoEsperado }) {
  const r = sinStockOInexistente(consulta, dijoElCliente);
  const pasa = !!r.agotado === agotadoEsperado;
  console.log(`${pasa ? "✅" : "❌"} ${nombre}\n     consulta: "${consulta}" -> agotado=${!!r.agotado}${r.producto ? ` (${r.producto})` : ""}`);
  pasa ? ok++ : mal++;
}

console.log("\n── CUBREASIENTOS: se confeccionan a medida, NUNCA se contestan como agotados ──");
caso("capitoneado negro para Fiat Palio (caso real: matcheaba el Palio Weekend eco cuero ROJO)", {
  consulta: "cubreasiento capitoneado negro fiat palio",
  dijoElCliente: "de este color tenes modelo para Fiat palio o es universal?",
  agotadoEsperado: false,
});
caso("capitoneado rojo para Suzuki S-Presso (caso real: la publicación estaba MAL CARGADA en ML)", {
  consulta: "cubreasiento capitoneado rojo suzuki s-presso",
  dijoElCliente: "5) Capitoneado premium - Rojo. Este me gusta, cuanto saldría aprox?",
  agotadoEsperado: false,
});
caso("cubreasiento de tela para Citroën AX (caso real: matcheaba un BERLINGO por la marca)", {
  consulta: "cubreasiento tela citroen ax",
  agotadoEsperado: false,
});
caso("cubreasiento sin línea para Fiat Palio", {
  consulta: "cubreasiento fiat palio",
  dijoElCliente: "Cuánto me sale cubre asientos para Fiat palio el? Ustedes lo instalan?",
  agotadoEsperado: false,
});
caso("la línea la nombró SOLO el cliente (Max buscó sin ella)", {
  consulta: "cubreasiento fiat palio",
  dijoElCliente: "4) Capitoneado premium - Negro — de este color tenés para mi Palio?",
  agotadoEsperado: false,
});

console.log("\n── ALFOMBRAS: sí se agotan, pero el agotado tiene que ser DEL MISMO producto ──");
caso("alfombra 3D para Gol G7 (lo pausado es la 5D: no es lo que pidió)", {
  consulta: "alfombra bandeja 3d vw gol g7",
  agotadoEsperado: false,
});
caso("alfombra bandeja para Strada Freedom (lo pausado es la de GOMA)", {
  consulta: "alfombra bandeja fiat strada freedom",
  agotadoEsperado: false,
});

console.log("\n── NO SE ROMPE lo que ya andaba: el agotado de verdad sigue saliendo ──");
caso("alfombra de goma para Strada (lo pausado ES la de goma)", {
  consulta: "alfombra goma fiat strada 2022",
  agotadoEsperado: true,
});
caso("alfombra bandeja 5d para Gol G7 (lo pausado ES la 5D)", {
  consulta: "alfombra bandeja 5d vw gol g7",
  agotadoEsperado: true,
});

console.log("\n── Y lo que está A LA VENTA se sigue vendiendo (no lo toca este cambio) ──");
for (const q of ["cubreasiento capitoneado hyundai hb20", "alfombra bandeja 3d toyota hilux"]) {
  const n = buscarPrecio(q).length;
  const pasa = n > 0;
  console.log(`${pasa ? "✅" : "❌"} "${q}" -> ${n} productos activos`);
  pasa ? ok++ : mal++;
}

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
