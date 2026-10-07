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
  tomar_pedido: () => ({ herramienta: "tomar_pedido", resultado: { pedido: { id: `p-${Math.random()}`, producto: "Cubreasiento eco cuero", medioPago: "efectivo" } } }),
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

// 7 oct 2026: al equipo se le avisa RECIÉN con el comprobante. Un "ya transferí"
// sin comprobante mandaba al equipo a cerrar ventas cuya plata nunca aparecía.
test("TRANSFERENCIA sin comprobante: queda registrada pero NO avisa al equipo", () => {
  const accion = { herramienta: "confirmar_transferencia", resultado: { transferencia: { monto: 2000, nombre: "Diego", comprobante: false } } };
  const { avisos, transferenciaSinRegistrar } = armarAvisos({ acciones: [accion], contacto, texto: "ya te transferí" });
  assert.equal(avisos.length, 0, "avisó una transferencia sin comprobante");
  assert.equal(transferenciaSinRegistrar, null, "la herramienta ya la registró");
});

test("RED DE SEGURIDAD: 'ya transferí' sin comprobante se registra, pero sin aviso", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({ acciones: [], contacto, texto: "ya te transferí los 4000" });
  assert.equal(avisos.length, 0, "avisó antes de tener el comprobante");
  assert.ok(transferenciaSinRegistrar, "igual hay que registrarla (queda en /admin)");
  assert.equal(transferenciaSinRegistrar.comprobante, false);
  assert.equal(transferenciaSinRegistrar.telefono, "092173216");
});

test("'te pasé el comprobante' escrito SIN adjunto no es comprobante", () => {
  const { avisos } = armarAvisos({ acciones: [], contacto, texto: "ya te pasé el comprobante" });
  assert.equal(avisos.length, 0);
});

test("PEDIDO por transferencia: espera el comprobante y sale UN aviso con el pedido adentro", () => {
  const chatId = "chat-espera-1";
  const pedido = { herramienta: "tomar_pedido", resultado: { pedido: { id: "pt-1", producto: "Cubreasiento eco cuero", modeloVehiculo: "Hilux 2020", medioPago: "Transferencia" } } };
  const antes = armarAvisos({ acciones: [pedido], contacto, chatId });
  assert.equal(antes.avisos.length, 0, "avisó el pedido antes del comprobante");
  assert.ok(!pideAtencionDelEquipo([pedido], ""));

  const { avisos } = armarAvisos({ acciones: [], contacto, chatId, pdfRecibido: true });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /COMPROBANTE DE TRANSFERENCIA RECIBIDO — verificá la plata y cerrá la venta/);
  assert.match(avisos[0], /Cubreasiento eco cuero · Hilux 2020/);

  // El pedido ya salió: un segundo comprobante no lo repite.
  const otra = armarAvisos({ acciones: [], contacto, chatId, pdfRecibido: true });
  assert.doesNotMatch(otra.avisos[0], /Hilux 2020/);
});

test("PEDIDO + comprobante en el MISMO turno (en cualquier orden): un aviso con el pedido", () => {
  const chatId = "chat-espera-2";
  const comp = EJEMPLOS.confirmar_transferencia();
  const pedido = { herramienta: "tomar_pedido", resultado: { pedido: { id: "pt-2", producto: "Alfombra", medioPago: "transferencia" } } };
  const { avisos } = armarAvisos({ acciones: [comp, pedido], contacto, chatId });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Pedido: Alfombra/);
});

test("PEDIDO por otro medio (efectivo) se avisa al momento, como siempre", () => {
  const pedido = { herramienta: "tomar_pedido", resultado: { pedido: { id: "pe-1", producto: "Alfombra", medioPago: "efectivo" } } };
  assert.equal(armarAvisos({ acciones: [pedido], contacto, chatId: "x" }).avisos.length, 1);
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

test("el chat queda SIN LEER cuando llega el comprobante (para que el equipo lo encuentre)", () => {
  assert.ok(pideAtencionDelEquipo([EJEMPLOS.confirmar_transferencia()], ""));
  assert.ok(!pideAtencionDelEquipo([], "ya te transferí"), "sin comprobante todavía no hay nada que cerrar");
  assert.ok(!pideAtencionDelEquipo([{ herramienta: "confirmar_transferencia", resultado: { transferencia: { comprobante: false } } }], ""));
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
