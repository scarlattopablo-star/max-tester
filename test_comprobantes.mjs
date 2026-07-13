// Prueba del parser de comprobantes (data-URI → {mime, tipo, base64}). Corre sin DB.
import { parseComprobante } from "./src/comprobantes.js";

let ok = 0, mal = 0;
const chk = (c, m) => { if (c) { ok++; console.log("✅", m); } else { mal++; console.log("❌", m); } };

const img = parseComprobante("data:image/jpeg;base64,/9j/AAAQSk");
chk(img && img.tipo === "imagen" && img.mime === "image/jpeg" && img.base64 === "/9j/AAAQSk", "imagen jpeg base64");

const pdf = parseComprobante("data:application/pdf;base64,JVBERi0x");
chk(pdf && pdf.tipo === "pdf" && pdf.mime === "application/pdf", "pdf base64");

chk(parseComprobante("data:text/plain;base64,aGk=") === null, "text/plain → null (no es comprobante)");
chk(parseComprobante("data:image/png,notbase64") === null, "sin ;base64 → null");
chk(parseComprobante("cualquier cosa") === null, "no data-uri → null");
chk(parseComprobante("data:image/png;base64," + "A".repeat(7_000_001)) === null, "supera el tope → null");

console.log(`\nRESULTADO: ${ok} OK, ${mal} fallidos`);
process.exit(mal ? 1 : 0);
