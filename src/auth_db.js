// Sesión de Baileys persistida en Postgres (Neon): sobrevive deploys/reinicios
// de Render (disco efímero). Se escanea el QR UNA vez (local, con DATABASE_URL
// apuntando a Neon) y Render levanta la sesión desde la tabla wa_auth.
import "./env.js";
import { initAuthCreds, BufferJSON, proto } from "baileys";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function prepararTabla() {
  await sql`create table if not exists wa_auth (clave text primary key, valor text not null)`;
}
async function leer(clave) {
  const rows = await sql`select valor from wa_auth where clave = ${clave}`;
  return rows.length ? JSON.parse(rows[0].valor, BufferJSON.reviver) : null;
}
async function guardar(clave, valor) {
  const texto = JSON.stringify(valor, BufferJSON.replacer);
  await sql`insert into wa_auth (clave, valor) values (${clave}, ${texto})
            on conflict (clave) do update set valor = ${texto}`;
}
async function borrar(clave) {
  await sql`delete from wa_auth where clave = ${clave}`;
}

export async function useDBAuthState() {
  await prepararTabla();
  const creds = (await leer("creds")) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            let v = await leer(`${type}-${id}`);
            if (type === "app-state-sync-key" && v) {
              v = proto.Message.AppStateSyncKeyData.fromObject(v);
            }
            if (v) data[id] = v;
          }
          return data;
        },
        set: async (data) => {
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type])) {
              const v = data[type][id];
              if (v) await guardar(`${type}-${id}`, v);
              else await borrar(`${type}-${id}`);
            }
          }
        },
      },
    },
    saveCreds: () => guardar("creds", creds),
  };
}
