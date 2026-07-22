// Configura el webhook de Max en 360dialog (una sola vez, cuando llegue la API key).
// Con 360dialog NO se toca developers.facebook.com: el webhook se setea contra SU
// API y ellos reenvían los eventos de Meta (messages, message_echoes, statuses).
//
// Uso:  D360_API_KEY=xxxx node set_webhook_360.mjs
//   (o con la key ya en .env:  node set_webhook_360.mjs)
import "./src/env.js";

const KEY = process.env.D360_API_KEY;
const WEBHOOK = process.env.WEBHOOK_URL || "https://max-tester.onrender.com/webhook";

if (!KEY) {
  console.error("FALTA D360_API_KEY (pasala por env o cargala en .env)");
  process.exit(1);
}

const r = await fetch("https://waba-v2.360dialog.io/v1/configs/webhook", {
  method: "POST",
  headers: { "D360-API-KEY": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ url: WEBHOOK }),
});
const data = await r.json().catch(() => ({}));
console.log(r.status, JSON.stringify(data));
if (!r.ok) process.exit(1);
console.log(`✅ webhook seteado: ${WEBHOOK}`);
