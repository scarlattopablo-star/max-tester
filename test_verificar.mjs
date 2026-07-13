// Prueba: se puede marcar una transferencia como verificada y listarTransferencias
// refleja el flag. Corre sin DATABASE_URL (modo archivo local).
import { registrarTransferencia, listarTransferencias, marcarVerificada } from "./src/transferencias.js";

let ok = 0, mal = 0;
const chk = (cond, msg) => { if (cond) { ok++; console.log("✅", msg); } else { mal++; console.log("❌", msg); } };

await registrarTransferencia({ chatId: "test-verif-" + Date.now(), monto: 1234, nombre: "Cliente Prueba", comprobante: true });
let lista = await listarTransferencias({ dias: 30, limite: 100 });
chk(lista.length > 0, "hay al menos una transferencia listada");
chk(lista[0].verificada === false, "arranca sin verificar");

const id = lista[0].id;
const r = await marcarVerificada({ id, verificada: true });
chk(r.ok === true, "marcarVerificada devuelve ok");

lista = await listarTransferencias({ dias: 30, limite: 100 });
chk(lista[0].verificada === true, "queda marcada como verificada tras marcarla");

const r2 = await marcarVerificada({ id, verificada: false });
lista = await listarTransferencias({ dias: 30, limite: 100 });
chk(r2.ok === true && lista[0].verificada === false, "se puede volver a pendiente");

console.log(`\nRESULTADO: ${ok} OK, ${mal} fallidos`);
process.exit(mal ? 1 : 0);
