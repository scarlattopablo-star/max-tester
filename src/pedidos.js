// Pedidos / intenciones de compra que el bot toma para que un humano cierre el cobro.
import { leer, guardar } from "./store.js";

const ARCHIVO = "pedidos.json";

export function listarPedidos() {
  return leer(ARCHIVO, []);
}

export function registrarPedido({ producto, modeloVehiculo, nombre, telefono, medioPago, notas }) {
  const pedidos = listarPedidos();
  const pedido = {
    id: "P" + (pedidos.length + 1).toString().padStart(4, "0"),
    producto: producto || "",
    modeloVehiculo: modeloVehiculo || "",
    nombre: nombre || "",
    telefono: telefono || "",
    medioPago: medioPago || "",
    notas: notas || "",
    estado: "pendiente_cobro",
    creado: new Date().toISOString(),
  };
  pedidos.push(pedido);
  guardar(ARCHIVO, pedidos);
  return { ok: true, pedido };
}
