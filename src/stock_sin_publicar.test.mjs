// Stock sin publicar (pedido de Pablo, 19 nov 2026): cubreasientos que hay en el
// local pero que Mercado Libre no muestra. Max dice que SÍ HAY y deriva, sin precio.
import test from "node:test";
import assert from "node:assert/strict";
import { armarRespuesta, ejecutarHerramienta, sinStockOInexistente } from "./cerebro.js";
import { AVISO_STOCK_SIN_PUBLICAR, AVISO_CUBREASIENTO_NO_DISPONIBLE, AVISO_A_MEDIDA } from "./config.js";
import { stockSinPublicar, STOCK_SIN_PUBLICAR } from "./stock_sin_publicar.js";

test("la lista reconoce los autos de la hoja y no se confunde", () => {
  assert.equal(stockSinPublicar("cubreasientos para mi Renault Clio").auto, "Renault Clio");
  assert.equal(stockSinPublicar("hyundai grand i10 2019").auto, "Hyundai Grand i10");
  assert.equal(stockSinPublicar("hyundai i10").auto, "Hyundai i10");
  assert.equal(stockSinPublicar("kia k3 cross").auto, "Kia K3 Cross");
  assert.equal(stockSinPublicar("fiat cronos").auto, "Fiat Cronos");
  assert.equal(stockSinPublicar("Citroën C-Elysée").auto, "Citroën C-Elysée");
  // 2008 como AÑO no es el Peugeot 2008; un Río que no es Kia tampoco.
  assert.equal(stockSinPublicar("toyota corolla 2008"), null);
  assert.equal(stockSinPublicar("peugeot 208 2008")?.auto, undefined);
  assert.equal(stockSinPublicar("hilux"), null);
  assert.equal(STOCK_SIN_PUBLICAR.length, 34);
});

test("cubreasiento de un auto de la lista: SÍ HAY, sin 'no tenemos' ni 'a medida'", () => {
  const r = sinStockOInexistente("cubreasiento renault clio", "tenés cubreasientos para el clio?");
  assert.equal(r.stockSinPublicar, "Renault Clio");
  assert.ok(!r.textoSinCubreasiento && !r.aMedida);
  // Solo el auto en la búsqueda: el producto lo dice el cliente.
  assert.equal(sinStockOInexistente("Renault Clio", "cubre asientos para clio").stockSinPublicar, "Renault Clio");
  // Una ALFOMBRA del mismo auto no entra por acá.
  assert.ok(!sinStockOInexistente("alfombra renault clio", "alfombras para el clio").stockSinPublicar);
  // Un auto que no está en la lista sigue con el "de momento no tenemos".
  assert.ok(sinStockOInexistente("cubreasiento jack ytterby", "cubre asientos para el ytterby").textoSinCubreasiento);
});

test("Corsa / Virtus: ni 'qué auto es' ni la alfombra — SÍ HAY", async () => {
  for (const auto of ["Chevrolet Corsa", "Volkswagen Virtus", "Nissan March"]) {
    const ctx = { _turno: {}, _ultimoUsuario: `cubreasientos para ${auto}`, dichoPorElCliente: `cubreasientos para ${auto}` };
    const r = await ejecutarHerramienta("consultar_precio", { producto: "cubreasiento", modelo: auto }, ctx);
    assert.equal(r.stockSinPublicar, auto, JSON.stringify(r).slice(0, 300));
    assert.equal(ctx._turno.stockSinPublicar, auto);
  }
});

test("la respuesta: texto fijo, sin precio ni 'no tenemos', y deriva sola con el precio para el equipo", async () => {
  const ctx = { _turno: {}, _ultimoUsuario: "hola tenés cubreasientos para kia picanto?", dichoPorElCliente: "hola tenés cubreasientos para kia picanto?" };
  const r = await ejecutarHerramienta("consultar_precio", { producto: "cubreasiento", modelo: "Kia Picanto" }, ctx);
  const acciones = [{ herramienta: "consultar_precio", input: { modelo: "Kia Picanto" }, resultado: r }];
  const out = armarRespuesta("Lamentablemente no tenemos cubreasientos para el Picanto. Salen $10.900.", acciones, ctx);
  assert.ok(out.texto.includes(AVISO_STOCK_SIN_PUBLICAR("Kia Picanto")), out.texto);
  assert.ok(!out.texto.includes(AVISO_CUBREASIENTO_NO_DISPONIBLE), out.texto);
  assert.ok(!out.texto.includes(AVISO_A_MEDIDA), out.texto);
  assert.ok(!/no tenemos|\$\s?10/i.test(out.texto), out.texto);
  // Sin precio inventado, el equipo recibe el resumen con el precio de la hoja.
  const ctx2 = { _turno: { ...ctx._turno }, _ultimoUsuario: ctx._ultimoUsuario, dichoPorElCliente: ctx.dichoPorElCliente };
  const out2 = armarRespuesta("Lamentablemente no tenemos cubreasientos para el Picanto.", [{ ...acciones[0] }], ctx2);
  assert.ok(out2.texto.includes(AVISO_STOCK_SIN_PUBLICAR("Kia Picanto")), out2.texto);
  const der = out2.acciones.find((a) => a.herramienta === "derivar_a_humano");
  assert.ok(der, "tiene que derivar");
  assert.match(der.input.resumen, /Kia Picanto.*10900 \+ 1000/);
});
