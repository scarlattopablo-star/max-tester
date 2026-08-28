// LAS MUESTRAS DE COSTURA SE LLAMAN "CAPITONEADO PREMIUM", NUNCA "ECO CUERO".
//
// Caso real del 17 de agosto de 2026 (Pablo). Max le mandó a una clienta la foto de
// la muestra con el pie "3) Eco cuero negro - Costura blanca" y le cotizó $6.500.
// Dos problemas en una sola línea de texto:
//   1) esa foto es del material CAPITONEADO (los archivos de public/ecocuero/ son los
//      MISMOS que los de public/capitoneado/): llamarla "eco cuero" le hace creer al
//      cliente que el eco cuero, que es otro artículo y otro precio, se ve así;
//   2) la costura de esa muestra es GRIS plata, no blanca.
//
// Regla del dueño: en esas fotos el pie dice SOLO "Capitoneado premium" + el color.
// La línea desde la que se mostró la foto (eco cuero / capitoneado) NO se pierde: viaja
// aparte, en la nota interna del historial, para que eleccionAmbigua siga funcionando.
//
// Corre con: node test_captions_capitoneado.mjs   (sin red y sin IA)
process.env.CATALOGO_SIN_DISCO = "1";
const { ejecutarHerramienta, armarRespuesta, eleccionAmbigua } = await import("./src/cerebro.js");

let pasaron = 0;
const fallos = [];
const ok = (cond, msg) => (cond ? (pasaron++, console.log("✅", msg)) : fallos.push(msg));

const eco = await ejecutarHerramienta("mostrar_ecocuero", {}, {});
const capi = await ejecutarHerramienta("mostrar_capitoneado", { que: "colores" }, {});

console.log("\n── ningún pie de foto dice 'eco cuero' ──");
const nombresEco = (eco.fotos || []).map((f) => f.nombre);
ok(nombresEco.length === 3, `mostrar_ecocuero manda las 3 costuras (${nombresEco.length})`);
ok(!nombresEco.some((n) => /eco\s*cuero/i.test(n)), `ninguno dice "eco cuero" → ${nombresEco.join(" | ")}`);
ok(nombresEco.every((n) => /^Capitoneado premium/.test(n)), "todos arrancan con 'Capitoneado premium'");

console.log("\n── la costura clara se llama GRIS, no blanca ──");
ok(nombresEco.some((n) => /costura gris/i.test(n)), "en las muestras de costura");
ok(
  (capi.fotos || []).some((f) => /costura gris/i.test(f.nombre)) &&
    !(capi.fotos || []).some((f) => /blanc/i.test(f.nombre)),
  "y en los 5 colores del capitoneado",
);

console.log("\n── el cliente pide 'blanca' y le llega igual la muestra ──");
const porBlanca = await ejecutarHerramienta("mostrar_ecocuero", { que: "blanca" }, {});
ok(porBlanca.fotos?.length === 1 && /gris/i.test(porBlanca.fotos[0].nombre), "pidiendo 'blanca' → costura gris");
const porGris = await ejecutarHerramienta("mostrar_capitoneado", { que: "gris" }, {});
ok(porGris.fotos?.length === 1 && /costura gris/i.test(porGris.fotos[0].nombre), "pidiendo 'gris' → costura gris");

console.log("\n── la LÍNEA no se pierde: viaja en la marca interna ──");
const acciones = [
  { herramienta: "mostrar_ecocuero", resultado: eco },
  { herramienta: "mostrar_capitoneado", resultado: capi },
];
// ⚠️ El ctx lleva lo que dijo el cliente: desde el 28 ago 2026 las fotos de las
// LÍNEAS no salen mientras no sepamos qué auto tiene ("primero el auto, después los
// materiales"). Acá el cliente ya dijo "Freedom", que es la charla de más abajo.
const dichoPorElCliente = "quiero cubreasientos para la Freedom";
const r = armarRespuesta("Te muestro las opciones.", acciones, { dichoPorElCliente, textoCharla: dichoPorElCliente });
const caps = r.imagenesEnviar.map((f) => f.caption);
ok(!caps.some((c) => /eco\s*cuero/i.test(c)), "lo que ve el cliente no nombra el eco cuero");
ok(r.imagenesEnviar.length === 5, `la misma foto no se manda dos veces (${r.imagenesEnviar.length} fotos, no 8)`);
const gris = r.imagenesEnviar.find((f) => /costura gris/i.test(f.caption));
ok(
  gris && gris.lineas.includes("eco cuero") && gris.lineas.includes("capitoneado premium"),
  `la muestra compartida queda marcada con las dos líneas → ${gris?.lineas.join(" y ")}`,
);

console.log("\n── y con los pies NUEVOS el guard del precio sigue preguntando ──");
// La nota interna tal como la escribe handler.js con los captions de hoy.
const nota =
  "[Contexto interno — opciones que le mostré al cliente con foto, numeradas: " +
  r.imagenesEnviar.map((f) => (f.lineas.length ? `${f.caption} (línea: ${f.lineas.join(" y ")})` : f.caption)).join("; ") +
  ".]";
const charla = [
  "Cliente: quiero cubreasientos para la Freedom",
  "Max: Te muestro las opciones." + nota,
  "Cliente: Este me gusta",
].join("\n");
for (const dicho of ["Ocre", "la gris", "el azul"]) {
  const amb = eleccionAmbigua(dicho, charla);
  ok(amb.ambigua && amb.lineas.length === 2, `"${dicho}" sin decir la línea → pregunta cuál de las dos`);
}
ok(!eleccionAmbigua("el capitoneado ocre", charla).ambigua, "si nombra la línea, no molesta");

console.log(fallos.length ? `\n❌ ${fallos.length} FALLARON:` : `\n✅ TODO OK — ${pasaron} pasaron, 0 fallaron`);
for (const f of fallos) console.log("   ✗", f);
process.exit(fallos.length ? 1 : 0);
