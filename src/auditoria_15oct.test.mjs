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

test("con el auto del cliente se pega UNA vez; en el turno siguiente ya no", () => {
  const base = {
    _turno: { cubreasientoSinCatalogo: true, catalogoVacio: true },
    _ultimoUsuario: "y cubreasientos para el jac ytterby?",
    dichoPorElCliente: "y cubreasientos para el jac ytterby?",
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

test("el rango oficial del cuero Sport no cuenta como precio inventado", async () => {
  const { filtrarPrecios } = await import("./cerebro.js");
  const r = filtrarPrecios("El cuero Sport va de $18.000 a $22.000 según el modelo. Un asesor te confirma el exacto.", []);
  assert.equal(r.inventado, null);
  assert.match(r.texto, /\$18\.000/);
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
