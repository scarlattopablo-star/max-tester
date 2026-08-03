// El pie de la plantilla "volvio_stock_max" le promete al cliente que respondiendo
// BAJA deja de recibir avisos. Esto prueba que esa promesa se cumpla por código:
// la baja NO puede depender de que la IA improvise una respuesta.
// Corre sin red ni base: node test_baja_avisos.mjs
process.env.CATALOGO_SIN_DISCO = "1";
import { procesarMensaje } from "./src/handler.js";

let ok = 0, mal = 0;
function caso(nombre, pasa, detalle = "") {
  console.log(pasa ? `✅ ${nombre}` : `❌ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  pasa ? ok++ : mal++;
}

// Un mensaje que ES la baja: se resuelve por código, sin llamar a la IA.
for (const texto of ["BAJA", "baja", "  Stop ", "no quiero más avisos", "NO ME ESCRIBAN MAS"]) {
  const r = await procesarMensaje({ chatId: "59899000001@s.whatsapp.net", texto, canal: "simulador" });
  const esBaja = (r.acciones || []).some((a) => a.herramienta === "baja_avisos");
  caso(`"${texto.trim()}" da de baja`, esBaja, JSON.stringify(r.acciones));
}

// Lo que NO es una baja tiene que seguir de largo hacia la IA. Solo miramos que NO
// se haya tomado como baja (la respuesta la da el modelo, acá no nos importa cuál).
for (const texto of ["dame de baja el pedido por favor, quiero cambiar el color", "hola, tenés alfombras para Hilux?"]) {
  const r = await procesarMensaje({ chatId: "59899000002@s.whatsapp.net", texto, canal: "simulador" });
  const esBaja = (r.acciones || []).some((a) => a.herramienta === "baja_avisos");
  caso(`"${texto.slice(0, 30)}..." NO se toma como baja`, !esBaja);
}

console.log(`\n${mal === 0 ? "✅ TODO OK" : "❌ HAY FALLAS"} — ${ok} pasaron, ${mal} fallaron`);
process.exit(mal === 0 ? 0 : 1);
