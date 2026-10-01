// Cuando la venta se cierra CON ENVÍO, el cliente tiene que enterarse de que la
// entrega demora de 4 a 5 días hábiles. El texto lo pone el CÓDIGO (no el modelo), igual
// que el aviso de colocación, para que salga siempre igual.
//
// Regla de diseño: ante la duda NO se manda. Decirle "llega en 2 a 3 días" a alguien
// que pasa a retirar por el local es peor que no decirle nada.
import test from "node:test";
import assert from "node:assert/strict";
import { esVentaConEnvio, armarRespuesta } from "./cerebro.js";
import { AVISO_ENVIO, AVISO_COLOCACION, PLAZO_ENVIO } from "./config.js";

const cierreConEnvio = (texto, resultado) =>
  armarRespuesta(texto, [{ herramienta: "tomar_pedido", resultado }], { textoCharla: "" }).texto;

// 1 oct 2026: Pablo fijó el plazo en una DEMORA DE ENTREGA de 4 a 5 días hábiles
// (antes era "se despacha dentro de los 2 o 3 días"). Vale para Max y para la web.
test("el aviso dice la demora de entrega de 4 a 5 días hábiles", () => {
  assert.equal(PLAZO_ENVIO, "4 a 5 días hábiles");
  assert.match(AVISO_ENVIO, /demora de entrega de 4 a 5 d[ií]as h[aá]biles/i);
  assert.match(AVISO_ENVIO, /DAC/);
  assert.doesNotMatch(AVISO_ENVIO, /2 o 3 d/i, "quedó el plazo viejo");
});

test("venta CON envío: el modelo lo declara", () => {
  assert.ok(esVentaConEnvio("envio", ""));
  assert.ok(esVentaConEnvio("", "envío por DAC a Tarariras"));
  assert.ok(esVentaConEnvio("", "va por agencia a Colonia Valdense"));
  assert.ok(esVentaConEnvio("", "mandar por encomienda"));
});

test("venta de RETIRO: nunca lleva el aviso", () => {
  assert.ok(!esVentaConEnvio("retiro", ""));
  assert.ok(!esVentaConEnvio("", "retira en el local"));
  assert.ok(!esVentaConEnvio("", "pasa por el local el martes"));
  assert.ok(!esVentaConEnvio("retiro", "lo busca el cliente"));
});

test("sin datos NO se inventa un envío", () => {
  assert.ok(!esVentaConEnvio("", ""));
  assert.ok(!esVentaConEnvio());
  assert.ok(!esVentaConEnvio("", "capitoneado negro para Hilux 2011"));
});

test("retiro + mención suelta de envío: gana el retiro", () => {
  assert.ok(!esVentaConEnvio("retiro", "consultó si hacíamos envíos pero pasa a retirar"));
});

// El bug que casi se me escapa: el filtro que saca el plazo inventado por el modelo
// trabajaba por PÁRRAFO, pero para ese punto la respuesta ya viene colapsada en uno
// solo — así que borraba el mensaje ENTERO y el cliente recibía puro texto oficial,
// sin el "¡Listo, te anoté el pedido!". Ahora se saca solo la ORACIÓN que sobra.
test("se borra el plazo que inventó el modelo, NO el resto del mensaje", () => {
  const salida = cierreConEnvio(
    "¡Listo, Sergio! Te anoté el capitoneado para tu Hilux. Normalmente llega en unos 5 a 7 días hábiles. Cualquier cosa quedo por acá.",
    { avisoEnvio: AVISO_ENVIO },
  );
  assert.match(salida, /¡Listo, Sergio!/, "se perdió el saludo del cierre");
  assert.match(salida, /Cualquier cosa quedo por acá/, "se perdió el cierre");
  assert.doesNotMatch(salida, /5 a 7 d/, "quedó el plazo inventado por el modelo");
  assert.match(salida, /demora de entrega de 4 a 5 días hábiles/, "no salió el plazo oficial");
});

test("lo mismo con el aviso de colocación (mismo defecto, ya corregido)", () => {
  const salida = cierreConEnvio(
    "¡Listo! Te anoté el capitoneado. La colocación te la coordinamos nosotros. Quedo a las órdenes.",
    { avisoColocacion: AVISO_COLOCACION },
  );
  assert.match(salida, /¡Listo!/);
  assert.match(salida, /Quedo a las órdenes/);
  assert.match(salida, /Importante sobre la COLOCACIÓN/);
});

test("venta de retiro: el mensaje sale sin ningún plazo", () => {
  const salida = cierreConEnvio("¡Listo! Te anoté la alfombra. La retirás por el local cuando quieras.", {});
  assert.doesNotMatch(salida, /4 a 5 días/);
  assert.doesNotMatch(salida, /Sobre el ENVÍO/);
});
