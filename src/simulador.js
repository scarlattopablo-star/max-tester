// SIMULADOR — probá el bot en la terminal SIN conectar WhatsApp.
// Usa exactamente el mismo cerebro que va a usar WhatsApp real.
//   npm run sim
import "./env.js";
import readline from "readline";
import { procesarMensaje } from "./handler.js";
import { listarTurnos } from "./agenda.js";
import { listarPedidos } from "./pedidos.js";
import { listarDerivaciones } from "./derivaciones.js";
import { reiniciar } from "./memoria.js";
import { NEGOCIO, ASISTENTE } from "./config.js";
import { sleep, delayEscritura } from "./humano.js";

const CHAT_ID = "simulador-local";
let canal = "whatsapp";

const c = {
  reset: "\x1b[0m", gris: "\x1b[90m", verde: "\x1b[32m", rojo: "\x1b[31m",
  cyan: "\x1b[36m", amarillo: "\x1b[33m", negrita: "\x1b[1m",
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = () => `${c.verde}${c.negrita}Vos (${canal})${c.reset} ➤ `;

function banner() {
  console.log(`${c.cyan}${c.negrita}
╔══════════════════════════════════════════════════════════╗
║   SIMULADOR — Agente IA · ${NEGOCIO.nombre.padEnd(28)}║
╚══════════════════════════════════════════════════════════╝${c.reset}
${c.gris}Escribí como si fueras un cliente. El bot responde igual que en WhatsApp.
Comandos:  /wa  /ig (cambiar canal) · /agenda · /pedidos · /derivaciones · /reset · /salir${c.reset}
${c.gris}Canal actual: ${c.amarillo}${canal}${c.gris}  (wa = WhatsApp completo · ig = Instagram deriva a WhatsApp)${c.reset}
`);
}

async function manejar(linea) {
  const texto = linea.trim();
  if (!texto) return;

  if (texto === "/salir" || texto === "/exit") { rl.close(); return; }
  if (texto === "/wa") { canal = "whatsapp"; console.log(`${c.amarillo}→ Canal: WhatsApp (agente completo)${c.reset}`); rl.setPrompt(prompt()); return; }
  if (texto === "/ig") { canal = "instagram"; console.log(`${c.amarillo}→ Canal: Instagram (deriva a WhatsApp)${c.reset}`); rl.setPrompt(prompt()); return; }
  if (texto === "/reset") { reiniciar(CHAT_ID); console.log(`${c.amarillo}→ Conversación reiniciada.${c.reset}`); return; }
  if (texto === "/agenda") {
    const t = listarTurnos();
    console.log(`${c.cyan}── Turnos agendados (${t.length}) ──${c.reset}`);
    t.forEach((x) => console.log(`  ${x.id}  ${x.fecha} ${x.hora}  ${x.nombre} (${x.telefono})  ${x.servicio} ${x.vehiculo}`));
    if (!t.length) console.log(`  ${c.gris}(vacío)${c.reset}`);
    return;
  }
  if (texto === "/pedidos") {
    const p = listarPedidos();
    console.log(`${c.cyan}── Pedidos tomados (${p.length}) ──${c.reset}`);
    p.forEach((x) => console.log(`  ${x.id}  ${x.producto}  ${x.modeloVehiculo}  ${x.nombre} (${x.telefono})  pago: ${x.medioPago}`));
    if (!p.length) console.log(`  ${c.gris}(vacío)${c.reset}`);
    return;
  }
  if (texto === "/derivaciones") {
    const d = listarDerivaciones();
    console.log(`${c.cyan}── Derivaciones a humano (${d.length}) ──${c.reset}`);
    d.forEach((x) => console.log(`  ${x.id}  [${x.motivo}]  ${x.nombre} (${x.telefono})  ${x.resumen}`));
    if (!d.length) console.log(`  ${c.gris}(vacío)${c.reset}`);
    return;
  }

  try {
    const { texto: respuesta, acciones } = await procesarMensaje({ chatId: CHAT_ID, texto, canal });
    // Pausa humana: "está escribiendo…" antes de mostrar la respuesta.
    process.stdout.write(`${c.gris}${ASISTENTE} está escribiendo…${c.reset}\r`);
    await sleep(delayEscritura(respuesta));
    process.stdout.write(`${" ".repeat(40)}\r`);
    console.log(`${c.rojo}${c.negrita}🤖 ${ASISTENTE}${c.reset} ➤ ${respuesta}\n`);
    for (const a of acciones) {
      const ok = a.resultado?.ok !== false;
      console.log(`   ${c.amarillo}⚙ acción: ${a.herramienta} → ${ok ? "OK" : "falló"}${c.reset} ${c.gris}${JSON.stringify(a.resultado)}${c.reset}`);
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("FALTA_API_KEY")) {
      console.log(`${c.rojo}⚠ Falta la clave de IA. Cargala en el archivo .env (ver README).${c.reset}`);
    } else if (e?.status === 429 || /rate.?limit/i.test(msg)) {
      console.log(`${c.amarillo}⏳ Se agotó el límite gratis de la IA por hoy/por minuto. Esperá unos minutos o cambiá de proveedor (IA_PROVIDER en .env).${c.reset}`);
    } else {
      console.log(`${c.rojo}⚠ Error: ${msg}${c.reset}`);
    }
  }
}

banner();
rl.setPrompt(prompt());
rl.prompt();
rl.on("line", async (linea) => { await manejar(linea); rl.prompt(); });
rl.on("close", () => { console.log(`${c.cyan}¡Listo! Cerrando simulador.${c.reset}`); process.exit(0); });
