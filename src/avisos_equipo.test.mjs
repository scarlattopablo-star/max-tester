// Los avisos al equipo son la parte del sistema donde un bug NO se ve: Max le
// contesta bien al cliente, la venta queda registrada... y el equipo nunca se
// entera. Pasó de verdad (ago 2026): al migrar a la Cloud API de Meta se
// copiaron 3 de los 4 avisos y las TRANSFERENCIAS se dejaron de avisar durante
// 3 semanas. Estos tests existen para que eso no pueda repetirse.
import test from "node:test";
import assert from "node:assert/strict";
import { armarAvisos, avisarAcciones, pideAtencionDelEquipo, HERRAMIENTAS_QUE_AVISAN } from "./avisos_equipo.js";

const contacto = { nombre: "Carlos Páez", tel: "092173216" };

// Una acción de ejemplo por CADA herramienta que tiene que avisar. Si mañana se
// agrega una herramienta a la lista, hay que agregarla acá o el test de
// cobertura falla: es el candado que evita otro aviso mudo.
const EJEMPLOS = {
  derivar_a_humano: () => ({ herramienta: "derivar_a_humano", resultado: { derivacion: { motivo: "pide_humano", resumen: "quiere hablar con un asesor" } } }),
  tomar_pedido: () => ({ herramienta: "tomar_pedido", resultado: { pedido: { id: `p-${Math.random()}`, producto: "Cubreasiento eco cuero", medioPago: "transferencia" } } }),
  solicitar_turno: () => ({ herramienta: "solicitar_turno", resultado: { turno: { id: `t-${Math.random()}`, nombre: "Carlos", telefono: "092173216", servicio: "colocación" } } }),
  confirmar_transferencia: () => ({ herramienta: "confirmar_transferencia", resultado: { transferencia: { monto: 6500, nombre: "Carlos Páez", telefono: "092173216", comprobante: true } } }),
};

test("COBERTURA: toda herramienta que avisa genera un aviso de verdad", () => {
  for (const herramienta of HERRAMIENTAS_QUE_AVISAN) {
    const ejemplo = EJEMPLOS[herramienta];
    assert.ok(ejemplo, `falta un ejemplo de "${herramienta}" en este test`);
    const { avisos } = armarAvisos({ acciones: [ejemplo()], contacto });
    assert.equal(avisos.length, 1, `"${herramienta}" no generó aviso al equipo`);
    assert.ok(avisos[0].length > 20, `el aviso de "${herramienta}" salió vacío`);
  }
});

test("TRANSFERENCIA con comprobante: avisa monto, cliente y link a la charla", () => {
  const { avisos } = armarAvisos({ acciones: [EJEMPLOS.confirmar_transferencia()], contacto });
  const aviso = avisos[0];
  assert.match(aviso, /COMPROBANTE DE TRANSFERENCIA RECIBIDO/);
  assert.match(aviso, /6\.500/);           // monto formateado es-UY
  assert.match(aviso, /Carlos Páez/);
  assert.match(aviso, /wa\.me\/59892173216/); // link directo a la conversación
});

test("TRANSFERENCIA sin comprobante: el aviso lo dice distinto", () => {
  const accion = { herramienta: "confirmar_transferencia", resultado: { transferencia: { monto: 2000, nombre: "Diego", comprobante: false } } };
  const { avisos } = armarAvisos({ acciones: [accion], contacto });
  assert.match(avisos[0], /AVISA QUE TRANSFIRIÓ/);
});

test("RED DE SEGURIDAD: si el modelo no llama la herramienta, el texto del cliente alcanza", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({ acciones: [], contacto, texto: "ya te transferí los 4000" });
  assert.equal(avisos.length, 1, "el cliente dijo que transfirió y nadie avisó");
  assert.match(avisos[0], /TRANSFIRIÓ/);
  assert.ok(transferenciaSinRegistrar, "hay que registrarla además de avisarla");
  assert.equal(transferenciaSinRegistrar.telefono, "092173216");
});

test("RED DE SEGURIDAD: no duplica si la herramienta YA avisó", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({
    acciones: [EJEMPLOS.confirmar_transferencia()],
    contacto,
    texto: "ya te transferí los 6500",
  });
  assert.equal(avisos.length, 1, "avisó dos veces la misma transferencia");
  assert.equal(transferenciaSinRegistrar, null);
});

// El caso más común de todos: el cliente manda el PDF del banco y NO escribe nada.
// Si el modelo no llama la herramienta, sin este backstop no avisa nadie.
test("PDF SOLO, sin texto: avisa igual aunque el modelo no llame la herramienta", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({
    acciones: [], contacto, texto: "", pdfRecibido: true, chatId: "59892173216",
  });
  assert.equal(avisos.length, 1, "llegó un comprobante en PDF y no avisó nadie");
  assert.match(avisos[0], /COMPROBANTE DE TRANSFERENCIA RECIBIDO/);
  assert.ok(transferenciaSinRegistrar?.comprobante, "un PDF ES el comprobante");
});

test("PDF + la herramienta: un solo aviso, no dos", () => {
  const { avisos } = armarAvisos({
    acciones: [EJEMPLOS.confirmar_transferencia()], contacto, pdfRecibido: true,
  });
  assert.equal(avisos.length, 1, "avisó dos veces el mismo comprobante");
});

test("una promesa a futuro NO dispara aviso", () => {
  const { avisos } = armarAvisos({ acciones: [], contacto, texto: "mañana te transfiero" });
  assert.equal(avisos.length, 0);
});

test("el chat queda SIN LEER cuando hay transferencia (para que el equipo lo encuentre)", () => {
  assert.ok(pideAtencionDelEquipo([EJEMPLOS.confirmar_transferencia()], ""));
  assert.ok(pideAtencionDelEquipo([], "ya te transferí"), "la red de seguridad también deja el chat sin leer");
  assert.ok(!pideAtencionDelEquipo([{ herramienta: "consultar_precio" }], "cuánto sale?"));
});

// Hasta acá probamos el TEXTO. Esto prueba la CAÑERÍA: que el aviso realmente
// salga por el transporte (es donde se rompió: el texto nunca se llegaba a armar).
test("ENVÍO: la transferencia sale de verdad por el transporte de WhatsApp", async () => {
  const { registrarTransporte } = await import("./notificador.js");
  const enviados = [];
  registrarTransporte(async (t) => { enviados.push(t); });
  try {
    await avisarAcciones({ acciones: [EJEMPLOS.confirmar_transferencia()], contacto, chatId: "59892173216" });
    assert.equal(enviados.length, 1, "el aviso de transferencia no salió por el transporte");
    assert.match(enviados[0], /COMPROBANTE DE TRANSFERENCIA RECIBIDO/);
  } finally {
    registrarTransporte(null);
  }
});

test("pedidos y turnos no se avisan dos veces (dedup por id)", () => {
  const pedido = { herramienta: "tomar_pedido", resultado: { pedido: { id: "fijo-1", producto: "Alfombra" } } };
  assert.equal(armarAvisos({ acciones: [pedido], contacto }).avisos.length, 1);
  assert.equal(armarAvisos({ acciones: [pedido], contacto }).avisos.length, 0);
});
