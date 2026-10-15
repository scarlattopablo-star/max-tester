// Auditoría de 100 charlas reales (15 oct 2026). Tres fallas que eran del CÓDIGO,
// no del modelo:
//  1. El texto del anuncio ("…la mejor calidad de cubreasientos…") contaba como si
//     lo hubiera escrito el cliente: una consulta por alfombras del Changan Hunter
//     salía con "Ese cubreasiento lo confeccionamos a medida" pegado adelante.
//  2. Esa frase salía antes de saber el auto y se repetía en cada turno.
//  3. "Geely EX2 Max" daba cero en el catálogo y Max decía "sin stock".
import test from "node:test";
import assert from "node:assert/strict";
import { armarRespuesta, buscarPrecio, ejecutarHerramienta, sinNotasDelSistema } from "./cerebro.js";
import { AVISO_A_MEDIDA, AVISO_PASO_ASESOR } from "./config.js";

const ANUNCIO = '[Contexto: el cliente llegó desde un anuncio de Instagram/Facebook sobre "La casa del cubreasiento" — Protege tus tapizados con la mejor calidad de cubreasientos, fabricados totalmente A MEDIDA. Así quedó esta Hilux cabina doble. Orientá la respuesta a ese producto.]';

test("las notas del sistema no cuentan como palabras del cliente", () => {
  const t = sinNotasDelSistema(`${ANUNCIO} tenés alfombras para la changan hunter?`);
  assert.ok(!/cubreasiento|hilux/i.test(t));
  assert.match(t, /alfombras para la changan hunter/);
});

test("alfombra sin catálogo + anuncio de cubreasientos: NO es un cubreasiento a medida", async () => {
  const ctx = { _turno: {}, _ultimoUsuario: `${ANUNCIO} tenés alfombras bandeja para la changan hunter reev?` };
  await ejecutarHerramienta("consultar_precio", { producto: "alfombra bandeja", modelo: "changan hunter reev" }, ctx);
  assert.equal(ctx._turno.catalogoVacio, true); // la búsqueda vacía corrió
  assert.equal(ctx._turno.cubreasientoSinCatalogo, undefined);
});

test("cubre volante pedido por quien ya compró cubreasientos: tampoco", async () => {
  const ctx = { _turno: {}, _ultimoUsuario: "los cubre asientos los compré ayer, necesito cubre volante para la hilux zzz9" };
  await ejecutarHerramienta("consultar_precio", { producto: "cubre volante", modelo: "hilux zzz9" }, ctx);
  assert.equal(ctx._turno.catalogoVacio, true); // la búsqueda vacía corrió
  assert.equal(ctx._turno.cubreasientoSinCatalogo, undefined);
});

test("sin auto dicho por el cliente (solo el del anuncio) no se pegan las frases fijas", () => {
  const ctx = {
    _turno: { cubreasientoSinCatalogo: true, catalogoVacio: true },
    _ultimoUsuario: `${ANUNCIO} ¿Cuánto cuesta el cuero sport premium?`,
    dichoPorElCliente: `${ANUNCIO} ¿Cuánto cuesta el cuero sport premium?`,
  };
  const { texto } = armarRespuesta("¿Para qué marca y modelo es? Así te paso el precio.", [], ctx);
  assert.ok(!texto.includes(AVISO_A_MEDIDA), texto);
  assert.ok(!texto.includes(AVISO_PASO_ASESOR), texto);
});

test("JMC sin publicación: la frase se pega UNA vez; en el turno siguiente ya no", () => {
  const base = {
    _turno: { cubreasientoSinCatalogo: true, catalogoVacio: true },
    _ultimoUsuario: "y cubreasientos para el jmc n900?",
    dichoPorElCliente: "y cubreasientos para el jmc n900?",
  };
  const r1 = armarRespuesta("Perfecto.", [], base);
  assert.ok(r1.texto.includes(AVISO_A_MEDIDA), r1.texto);
  assert.ok(r1.texto.includes(AVISO_PASO_ASESOR), r1.texto);
  const r2 = armarRespuesta("Listo.", [], { ...base, _turno: { cubreasientoSinCatalogo: true, catalogoVacio: true }, _recientesMax: r1.texto });
  assert.ok(!r2.texto.includes(AVISO_A_MEDIDA), r2.texto);
  assert.ok(!r2.texto.includes(AVISO_PASO_ASESOR), r2.texto);
});

test("ya no promete que se hace: lo confirma el asesor", () => {
  assert.ok(!/sin problema|perfectamente/i.test(AVISO_A_MEDIDA));
  assert.match(AVISO_PASO_ASESOR, /si lo podemos hacer/);
});

test("Geely EX2 Max encuentra las alfombras del EX2", () => {
  const lista = [
    { id: "1", n: "Alfombra Geely Ex2 Bandeja 3d Premium Para Auto Negro", p: 3783 },
    { id: "2", n: "Alfombra Bandeja 5d  Geely Ex2 Cubre El Socalo Negro", p: 4900 },
    { id: "3", n: "Alfombra Oroch Bandeja Rigida  Maxima Resistencia Negro", p: 3790 },
  ];
  const r = buscarPrecio("alfombra geely ex2 max", lista);
  assert.equal(r.length, 2);
  assert.ok(r.every((p) => /ex2/i.test(p.nombre)));
});

test("el precio oficial del cuero Sport (config.js) no cuenta como inventado", async () => {
  const { filtrarPrecios } = await import("./cerebro.js");
  const { CUBREASIENTOS } = await import("./config.js");
  const v = CUBREASIENTOS.sport.precioDesde.toLocaleString("es-UY");
  const r = filtrarPrecios(`El cuero Sport te sale $${v} colocado. Un asesor coordina la confección.`, []);
  assert.equal(r.inventado, null);
  assert.ok(r.texto.includes(`$${v}`), r.texto);
});

test("descripción oficial del Sport sin derivar: el código deriva igual y el equipo se entera", () => {
  const acciones = [{ herramienta: "descripcion_oficial", input: { linea: "cuero_sport" }, resultado: { ok: true } }];
  const ctx = { _turno: { busco: true }, _ultimoUsuario: "2024", dichoPorElCliente: "cuero sport para mi strada doble cabina 2024" };
  const r = armarRespuesta("¡Mirá lo lindo que quedan! ¿Te interesa que le pase tu consulta?", acciones, ctx);
  const d = r.acciones.find((a) => a.herramienta === "derivar_a_humano");
  assert.ok(d, "tiene que haber derivación");
  assert.equal(d.resultado?.ok, true);
  assert.match(d.input.resumen, /CUERO SPORT/);
});

test("la pregunta precargada del anuncio no cuenta como elegir el Sport", async () => {
  const { marcarPreguntaPrecargada, NOTA_PREGUNTA_PRECARGADA } = await import("./cerebro.js");
  const conAnuncio = `${ANUNCIO} ¿Cuánto cuesta el cuero sport premium?`;
  assert.ok(marcarPreguntaPrecargada(conAnuncio).includes(NOTA_PREGUNTA_PRECARGADA));
  assert.ok(marcarPreguntaPrecargada("cuanto cuesta el cuero sport premium").includes(NOTA_PREGUNTA_PRECARGADA));
  // Con palabras propias (nombra su auto) SÍ es una elección: no se toca.
  const propio = "¿Cuánto cuesta el cuero sport premium? Q sale para una Strada pikup";
  assert.equal(marcarPreguntaPrecargada(propio), propio);
  // La nota se va con sinNotasDelSistema: no se confunde con palabras del cliente.
  assert.ok(!sinNotasDelSistema(NOTA_PREGUNTA_PRECARGADA).includes("ALFOMBRAS"));
});

test("la descripción del Sport solo sale si el cliente lo eligió", async () => {
  const { clienteEligioSport, marcarPreguntaPrecargada } = await import("./cerebro.js");
  const pre = marcarPreguntaPrecargada(`${ANUNCIO} ¿Cuánto cuesta el cuero sport premium?`);
  assert.equal(clienteEligioSport({ dichoPorElCliente: `${pre} Onix 2024` }), false);
  assert.equal(clienteEligioSport({ dichoPorElCliente: `${pre} Onix 2024 quiero el sport` }), true);
  assert.equal(clienteEligioSport({ dichoPorElCliente: `${pre} [Contexto interno — el cliente respondió CITANDO esta foto que le mandaste: "Cubreasiento premium en cuero automotriz Sport (2)". Es ESA la que eligió] este` }), true);
  assert.equal(clienteEligioSport({ dichoPorElCliente: "tengo una ford ecosport 2020" }), false);
  const r = await ejecutarHerramienta("descripcion_oficial", { linea: "cuero_sport" }, { _turno: {}, dichoPorElCliente: `${pre} Onix 2024`, _ultimoUsuario: "Onix 2024" });
  assert.equal(r.ok, false);
});


// Decisión de Pablo (15 oct 2026): fuera de JMC, auto sin cubreasientos en ML →
// "de momento no tenemos", sin asesor.
test("cubreasiento sin publicación (no JMC): texto oficial, sin 'a medida' y sin derivar", async () => {
  const { sinStockOInexistente } = await import("./cerebro.js");
  const { AVISO_CUBREASIENTO_NO_DISPONIBLE } = await import("./config.js");
  const r = sinStockOInexistente("cubreasiento jack ytterby", "cubre asientos para el ytterby");
  assert.equal(r.textoSinCubreasiento, AVISO_CUBREASIENTO_NO_DISPONIBLE);
  assert.ok(!r.aMedida);
  const jmc = sinStockOInexistente("cubreasiento jmc zz900", "cubreasientos para mi jmc");
  assert.equal(jmc.aMedida, true);

  const acciones = [
    { herramienta: "enviar_foto", input: { producto: "cubreasiento Jack Ytterby" }, resultado: { ok: false, ...r } },
    { herramienta: "derivar_a_humano", input: { motivo: "otro", resumen: "ytterby" }, resultado: { ok: true, pendiente: true } },
  ];
  const ctx = { _turno: { busco: true, catalogoVacio: true, sinCubreasiento: true, derivacionPendiente: { motivo: "otro", resumen: "ytterby" } }, _ultimoUsuario: "cubre asientos para el ytterby?", dichoPorElCliente: "cubre asientos para el ytterby?" };
  const out = armarRespuesta("Para tu Jack Ytterby lo confeccionamos a medida. Te paso con un asesor.", acciones, ctx);
  assert.ok(out.texto.includes(AVISO_CUBREASIENTO_NO_DISPONIBLE), out.texto);
  assert.ok(!/a medida|asesor/i.test(out.texto.replace(AVISO_CUBREASIENTO_NO_DISPONIBLE, "")), out.texto);
  assert.equal(out.acciones.find((a) => a.herramienta === "derivar_a_humano").resultado.ok, false);
});

test("varias derivaciones en el mismo turno: el equipo recibe UN aviso", async () => {
  const { armarAvisos } = await import("./avisos_equipo.js");
  const acciones = [
    { herramienta: "enviar_foto", input: {}, resultado: { ok: true } },
    { herramienta: "derivar_a_humano", input: { motivo: "otro", resumen: "a" }, resultado: { ok: true, pendiente: true } },
    { herramienta: "derivar_a_humano", input: { motivo: "otro", resumen: "a" }, resultado: { ok: true, pendiente: true } },
  ];
  const ctx = { _turno: { busco: true, hayCatalogo: true, derivacionPendiente: { motivo: "otro", resumen: "a" } }, _ultimoUsuario: "quiero el capitoneado para la strada", dichoPorElCliente: "quiero el capitoneado para la strada" };
  const out = armarRespuesta("Listo, ya le paso al equipo.", acciones, ctx);
  const { avisos } = armarAvisos({ acciones: out.acciones, chatId: "59899000000" });
  assert.equal(avisos.filter((x) => /asesor/i.test(x)).length, 1, avisos.join("\n---\n"));
});

test("derivación solo ofrecida o rechazada: no le avisa al equipo", async () => {
  const { armarAvisos } = await import("./avisos_equipo.js");
  const { avisos } = armarAvisos({ acciones: [{ herramienta: "derivar_a_humano", input: { motivo: "otro" }, resultado: { ok: false, motivo: "solo_ofrecida" } }], chatId: "59899000000" });
  assert.equal(avisos.length, 0);
});

test("después del 'no tenemos', el turno siguiente no vuelve a prometer 'a medida'", async () => {
  const { AVISO_CUBREASIENTO_NO_DISPONIBLE } = await import("./config.js");
  const ctx = { _turno: { busco: false }, _ultimoUsuario: "2026", dichoPorElCliente: "cubre asientos para el ytterby? 2026", _recientesMax: AVISO_CUBREASIENTO_NO_DISPONIBLE };
  const out = armarRespuesta("Perfecto, tengo el dato. De todas formas, para ese modelo los cubreasientos se confeccionan a medida.", [], ctx);
  assert.ok(!/a medida|confeccion/i.test(out.texto), out.texto);
});

test("afirmar 'tenemos / a medida' sin buscar dispara una vuelta más", async () => {
  const { afirmaSinBuscar } = await import("./cerebro.js");
  const ctx = { _ultimoUsuario: "Y cubre asientos delanteros y traseros para el ytterby tienen y que costo?" };
  assert.equal(afirmaSinBuscar("Sí, tenemos cubreasientos a medida para el Jac Ytterby. ¿Qué año es?", [], ctx), true);
  assert.equal(afirmaSinBuscar("Sí, tenemos cubreasientos a medida.", [{ herramienta: "enviar_foto" }], ctx), false);
  assert.equal(afirmaSinBuscar("¿Para qué año es?", [], ctx), false);
  assert.equal(afirmaSinBuscar("Sí, tenemos.", [], { _ultimoUsuario: "y alfombras?" }), false);
});

// Pedido de Pablo (15 oct 2026): modelo mal escrito → preguntar por el parecido, no
// decir "no tenemos" de una.
const CAT_PRUEBA = [
  { id: "a", n: "Cubreasiento Fiat Mobi Cuero Ecoligogico Capitoneado Alta Ga Negro", p: 10900 },
  { id: "b", n: "Cubreasiento Suzuki Fronx Negro", p: 13500 },
  { id: "c", n: "Cubreasiento Byd Yuan Pro Cuero Ecolgico+ Kit Bar Negro", p: 12900 },
  { id: "d", n: "Cubreasiento Honda Wr-v  Cuero Ecologico Negro", p: 13900 },
  { id: "e", n: "Cubreasiento Wingle 5/7/3  Cuero Ecolgico Alta Gama Negro", p: 13900 },
  { id: "f", n: "Cubreasiento Chevrolet Onix Cuero Ecologico Capitoneado Negro", p: 8900 },
];
test("modelo mal escrito: sugiere el parecido de la misma marca, nunca otro auto", async () => {
  const { modelosParecidos } = await import("./cerebro.js");
  const pal = (q) => modelosParecidos(q, "cubreasiento", CAT_PRUEBA).map((x) => x.palabra);
  assert.deepEqual(pal("cubreasiento fiat movil"), ["mobi"]);
  assert.deepEqual(pal("cubreasiento suzuki fronks"), ["fronx"]);
  assert.deepEqual(pal("cubreasiento vw suran"), []); // no "yuan"
  assert.deepEqual(pal("cubreasiento honda fit"), []); // no "kit"
});
test("modelo de 3 letras o número solo: no se le ofrece otro auto de la marca", () => {
  assert.equal(buscarPrecio("cubreasiento honda fit", CAT_PRUEBA).length, 0); // no la WR-V
  assert.equal(buscarPrecio("cubreasiento chevrolet joy", CAT_PRUEBA).length, 0); // no el Onix
  assert.equal(buscarPrecio("cubreasiento tesla model 3", CAT_PRUEBA).length, 0); // no la Wingle
  assert.equal(buscarPrecio("cubreasiento chevrolet onix", CAT_PRUEBA).length, 1);
});
