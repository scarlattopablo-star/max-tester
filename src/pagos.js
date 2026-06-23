// Pagos con Mercado Pago: Max genera un LINK DE PAGO por el monto exacto de la
// compra (Checkout Pro / "preference") y se lo manda al cliente para que pague
// directo con tarjeta o dinero en cuenta.
//
// Necesita el ACCESS TOKEN de producción de la cuenta de Mercado Pago del negocio
// en la variable de entorno MP_ACCESS_TOKEN (.env local / Environment en Render).
// Si no está cargado, crearLinkPago devuelve {ok:false} y Max deriva a un humano.
import "./env.js";
import { guardarLinkMax } from "./ml_stock.js";

const MP_API = "https://api.mercadopago.com/checkout/preferences";

export function hayMercadoPago() {
  return !!process.env.MP_ACCESS_TOKEN;
}

// Crea un link de pago por el monto exacto. Devuelve {ok, link, id} o {ok:false, motivo}.
// titulo: descripción que ve el cliente al pagar (ej: "Cubreasiento capitoneado Hilux 2024 negro").
// monto: número en pesos uruguayos (UYU).
// items (opcional): [{id, qty}] con el id de ML de lo vendido — se guarda asociado
// al link para que, cuando el pago se acredite, se descuente el stock en ML.
// chatId / contacto (opcional): conversación y datos del cliente, para que al
// acreditarse el pago el aviso al equipo lleve el link a la charla y quién compró.
export async function crearLinkPago({ titulo, monto, items, chatId, contacto }) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return { ok: false, motivo: "MP_ACCESS_TOKEN no configurado" };

  const precio = Math.round(Number(monto) * 100) / 100;
  if (!precio || precio <= 0) return { ok: false, motivo: "monto inválido" };
  const tituloLimpio = String(titulo || "Compra La Casa del Cubreasiento").slice(0, 120);

  try {
    const ref = `max-${Date.now()}`;
    const res = await fetch(MP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [
          {
            title: tituloLimpio,
            description: "La Casa del Cubreasiento",
            quantity: 1,
            currency_id: "UYU",
            unit_price: precio,
          },
        ],
        // Máximo 13 caracteres según la doc de MP (más largo se trunca en el resumen de la tarjeta).
        statement_descriptor: "CUBREASIENTO",
        external_reference: ref,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.init_point) {
      const motivo = body?.message || `HTTP ${res.status}`;
      console.error("MP error:", motivo);
      return { ok: false, motivo };
    }
    // Recordar a qué conversación/cliente y producto pertenece este link: cuando el
    // pago se acredite (webhook de la web) se baja el stock en ML y el aviso al equipo
    // lleva el link a la charla y los datos del cliente. Se guarda SIEMPRE (aunque no
    // se haya identificado el producto). Best effort: el link sale igual.
    try {
      await guardarLinkMax(ref, { items, chatId, contacto });
    } catch (e) {
      console.error("⚠ No pude guardar el mapeo del link de pago:", e.message);
    }
    return { ok: true, link: body.init_point, id: body.id, monto: precio, titulo: tituloLimpio };
  } catch (e) {
    console.error("MP excepción:", e.message);
    return { ok: false, motivo: String(e.message || e) };
  }
}
