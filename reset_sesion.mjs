// Borra la sesión de WhatsApp guardada en Neon (tabla wa_auth) para poder
// vincular a Max con OTRO número (escaneando un QR nuevo).
//
// USO:
//   1) Tené el DATABASE_URL de Neon (el mismo que está en Render → Environment).
//   2) Corré:  node reset_sesion.mjs
//      (o:  DATABASE_URL="postgres://..." node reset_sesion.mjs  si no está en el .env)
//
// Después de borrar: en Render poné WHATSAPP_ON=1 y reiniciá el servicio;
// entrá a /qr?clave=<NOTIFY_TOKEN> y escaneá con el teléfono de la casa.
import "./src/env.js";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ Falta DATABASE_URL. Copialo de Render → Environment y volvé a correr:");
  console.error('   DATABASE_URL="postgres://USER:PASS@HOST/db" node reset_sesion.mjs');
  process.exit(1);
}

const sql = neon(url);

try {
  await sql`create table if not exists wa_auth (clave text primary key, valor text not null)`;
  const antes = await sql`select count(*)::int as n from wa_auth`;
  await sql`delete from wa_auth`;
  console.log(`🧹 Sesión borrada. Se eliminaron ${antes[0].n} filas de wa_auth.`);
  console.log("✅ Listo: ahora Max va a pedir un QR nuevo al arrancar.");
  console.log("   Siguiente paso: WHATSAPP_ON=1 en Render → reiniciar → entrar a /qr?clave=<NOTIFY_TOKEN> y escanear con el teléfono de la casa.");
} catch (e) {
  console.error("❌ Error borrando la sesión:", e.message);
  process.exit(1);
}
