// QUÉ FOTO CITÓ EL CLIENTE.
//
// En WhatsApp, la forma natural de elegir entre varias fotos es RESPONDER a una de
// ellas ("Este me gusta"). La Cloud API nos manda ese vínculo en `message.context.id`
// = el id del mensaje citado. Hasta el 7 ago 2026 no lo leíamos: Max veía solo el
// texto suelto y tenía que adivinar cuál era. Adivinó mal y cobró $3.279 de menos
// (Vanessa Leites, chat 59898785444: eligió el capitoneado ocre y le facturó el eco
// cuero liso).
//
// Acá se recuerda, por cada foto/video que manda Max, qué producto era. Vive en
// memoria a propósito: es un dato de la charla del momento, y si el proceso se
// reinicia y perdemos la referencia, el que llama se entera (devuelve null) y trata la
// cita como "no la puedo identificar" — que es honesto y dispara la pregunta, en vez
// de una suposición.
const porMensaje = new Map(); // msgId -> caption
const MAX = 1500;

export function recordarEnviado(msgId, caption) {
  if (!msgId || !caption) return;
  porMensaje.set(String(msgId), String(caption));
  while (porMensaje.size > MAX) porMensaje.delete(porMensaje.keys().next().value);
}

// Devuelve el caption de la foto citada, o null si no la tenemos.
export function loQueCito(msgId) {
  if (!msgId) return null;
  return porMensaje.get(String(msgId)) || null;
}

// El texto que se le antepone al mensaje del cliente para que Max sepa a qué
// respondió. Va como parte del turno del cliente (no es una nota del sistema).
export function marcaDeCita(msgId) {
  if (!msgId) return "";
  const cap = loQueCito(msgId);
  // El caption sale numerado ("3) Capitoneado premium - Negro con costura ocre"):
  // el número era de aquella tanda y ahora no significa nada, así que se saca.
  const limpio = cap ? cap.replace(/^\s*\d+\)\s*/, "").trim() : "";
  // ⚠️ Arrancan con "[Contexto ..." a propósito: así `limpiarJerga` los recorta si el
  // modelo los copia en su respuesta. El 5 ago 2026 Max le mandó a un cliente una nota
  // interna pegada en el mensaje, y el corte de limpiarJerga es lo que lo evita.
  return limpio
    ? `[Contexto interno — el cliente respondió CITANDO esta foto que le mandaste: "${limpio}". Es ESA la que eligió: no le preguntes de nuevo cuál era.] `
    // Redacción condicional a propósito: el cliente también puede estar citando un
    // mensaje SUYO ("como te dije, es una Hilux"), y ahí este aviso no tiene que
    // meter ruido. Solo pide preguntar si de verdad estaba eligiendo algo.
    : "[Contexto interno — el cliente respondió citando un mensaje anterior, pero no puedo saber cuál era. Si estaba eligiendo entre varias opciones que le mostraste, NO adivines: preguntale por el NOMBRE (qué línea y qué color) antes de darle precio.] ";
}

// Solo para las pruebas.
export function _olvidarTodo() {
  porMensaje.clear();
}
