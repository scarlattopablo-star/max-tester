// EL COMPROBANTE QUE LLEGA COMO FOTO.
//
// La red de seguridad de avisos_equipo.js tenía DOS disparadores: que el cliente
// ESCRIBA que transfirió, o que llegue un PDF. Un ticket de Abitab fotografiado o
// una captura de la app del banco no es ninguna de las dos cosas: es una IMAGEN
// sin texto, y se colaba por el medio.
//
// Caso real (21 sep 2026, chat 59895420855): el cliente mandó la foto de un
// comprobante de Abitab por $1.000 y Max contestó "Vi el comprobante de Abitab.
// Listo, le paso todo al equipo". No lo pasó: no llamó la herramienta y la red no
// se disparó. La plata entró y no quedó registrada en ningún lado.
//
// El disparador nuevo mira lo que MAX DIJO que vio. Es código, no confianza en que
// el modelo llame la herramienta — que es justo lo que no hace.
//
// Las frases de abajo son TEXTUALES de las conversaciones del 21 sep: el mismo día
// entraron 19 fotos de clientes y solo UNA era un pago. Si un cambio hace que
// alguna de las otras 18 dispare un aviso, el equipo se llena de falsos avisos de
// plata y deja de mirarlos.
import test from "node:test";
import assert from "node:assert/strict";
import { maxVioUnComprobante } from "./ws_mensaje.js";

// La única foto de hoy que era plata.
const ES_COMPROBANTE = [
  "¡Perfecto! Vi el comprobante de Abitab. Listo, le paso todo al equipo para que verifique el pago y te confirme a la brevedad.",
  "Recibí tu comprobante de transferencia, ya se lo paso al equipo para que lo verifique.",
  "Perfecto, veo la transferencia por $ 9.650. El equipo la confirma y te avisa.",
  "Llegó el depósito, gracias. Le paso el dato al equipo.",
  "Vi el comprobante del Itaú, queda registrado.",
];

// Fotos de autos y asientos: TEXTUALES de las respuestas de Max del 21 sep.
const NO_ES_COMPROBANTE = [
  "Perfecto, Juan Carlos. Veo los asientos con claridad — están en muy buen estado. Los cubreasientos van a quedar impecables ahí.",
  "Perfecto, veo tu Volvo 460 bordeaux. Un clásico que merece buenos cuidados. Para ese modelo fabricamos cubreasientos a medida.",
  "Veo que es una cabina con asientos negros. Por la estructura y el diseño, parece ser una camioneta, pero no estoy 100% seguro del modelo.",
  "Perfecto, veo que tenés un JAC 1035. Para ese camión tenemos cubreasientos a medida que se confeccionan especialmente.",
  "Veo que es una camioneta, por la distribución de los asientos y el espacio.",
  // ⚠️ Esta es la trampa: dice "pago" pero está OFRECIENDO cómo pagar, no viendo un pago.
  "Una vez que me digas cómo querés recibirla, te paso los medios de pago. ¿Envío o retiro?",
  // Max PIDIENDO el comprobante no es Max VIÉNDOLO.
  "Cuando hagas la transferencia, mandame el comprobante así lo verifico.",
  "Perfecto. Cuando la tengas hecha, pasame el comprobante de la transferencia.",
  "",
];

test("reconoce cuando Max dice que VIO un pago", () => {
  for (const frase of ES_COMPROBANTE) {
    assert.equal(maxVioUnComprobante(frase), true, `no lo reconoció: "${frase.slice(0, 60)}"`);
  }
});

test("NO confunde una foto de auto o de asientos con un pago", () => {
  for (const frase of NO_ES_COMPROBANTE) {
    assert.equal(maxVioUnComprobante(frase), false, `falso positivo: "${frase.slice(0, 60)}"`);
  }
});

test("no cruza de una oración a la otra", () => {
  // Sin el corte por oración, "recibí" de la primera se engancharía con
  // "transferencia" de la segunda y avisaría de una plata que no entró.
  assert.equal(
    maxVioUnComprobante("Perfecto, recibí tu mensaje. Cuando hagas la transferencia avisame."),
    false,
  );
});

// ── La red de seguridad, de punta a punta ────────────────────────────────────
// El detector puede estar perfecto y no servir de nada si nadie lo llama: eso es
// exactamente lo que pasó con los avisos rebotados. Estos tests miran armarAvisos.
import { armarAvisos } from "./avisos_equipo.js";

const contacto = { nombre: "Ricardo", tel: "095420855" };

test("EL CASO REAL: foto de comprobante sin texto → se registra y se avisa", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({
    acciones: [],
    contacto,
    texto: "", // el cliente mandó la foto SOLA, sin escribir nada
    chatId: "59895420855",
    fotoRecibida: true,
    respuestaMax: "¡Perfecto! Vi el comprobante de Abitab. Listo, le paso todo al equipo para que verifique el pago y te confirme a la brevedad.",
  });

  assert.ok(transferenciaSinRegistrar, "la plata tiene que quedar registrada");
  assert.equal(transferenciaSinRegistrar.comprobante, true);
  assert.equal(transferenciaSinRegistrar.chatId, "59895420855");
  assert.equal(avisos.length, 1, "el equipo tiene que recibir el aviso");
  assert.match(avisos[0], /COMPROBANTE DE TRANSFERENCIA RECIBIDO/);
});

test("una foto de los asientos NO registra ninguna transferencia", () => {
  const { avisos, transferenciaSinRegistrar } = armarAvisos({
    acciones: [],
    contacto,
    texto: "",
    chatId: "59898877467",
    fotoRecibida: true,
    respuestaMax: "Perfecto, Juan Carlos. Veo los asientos con claridad — están en muy buen estado. Los cubreasientos van a quedar impecables ahí.",
  });

  assert.equal(transferenciaSinRegistrar, null, "una foto de asientos no es plata");
  assert.equal(avisos.length, 0);
});

test("sin foto, la frase sola no alcanza (no se inventa una transferencia)", () => {
  const { transferenciaSinRegistrar } = armarAvisos({
    acciones: [],
    contacto,
    texto: "",
    chatId: "59895420855",
    fotoRecibida: false,
    respuestaMax: "Vi el comprobante de Abitab, le paso todo al equipo.",
  });
  assert.equal(transferenciaSinRegistrar, null);
});

test("si el modelo SÍ llamó la herramienta, no se avisa dos veces", () => {
  const { avisos } = armarAvisos({
    acciones: [{ herramienta: "confirmar_transferencia", resultado: { transferencia: { monto: 1000, nombre: "Sandra Eguren", comprobante: true } } }],
    contacto,
    texto: "",
    chatId: "59895420855",
    fotoRecibida: true,
    respuestaMax: "Vi el comprobante de Abitab, le paso todo al equipo.",
  });
  assert.equal(avisos.length, 1, "un solo aviso, no uno por la herramienta y otro por la red");
});
