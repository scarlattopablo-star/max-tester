# Outlet Market — Orquesta IA

Todo el material de la propuesta a **Outlet Market** (outletmarket.uy), outlet de
electrodomésticos en Montevideo. Reunión inicial: 30 jul 2026.

## Contenido de la carpeta

| Archivo | Qué es | Para quién |
|---|---|---|
| `Presupuesto_OrquestaIA_OutletMarket.pdf` | **El entregable.** 2 páginas, listo para enviar. | Cliente |
| `presupuesto-2paginas.html` | Fuente del PDF. Se edita acá y se regenera (ver abajo). | — |
| `presupuesto-extendido.html` | Versión larga del presupuesto, con el detalle completo de alcance, costos, mantenimiento y el módulo opcional de stock por planilla. | Cliente, como anexo |
| `brief-reunion.html` | Brief **interno** de reunión: pitch, preguntas de descubrimiento, stack, objeciones y cierre. | Uso propio |
| `BRIEF_COMERCIAL.md` | El mismo brief en Markdown, reutilizable con otros prospectos. | Uso propio |

## La oferta

- **Implementación:** US$ 1.500 (50 % a la aceptación, 50 % a la salida al aire)
- **Mantenimiento:** US$ 200 / mes
- **Costo operativo:** US$ 275–295 / mes, a cargo de Outlet Market, pagado con su
  tarjeta directamente a cada proveedor (Anthropic, 360dialog, Railway, Neon, Meta)
- **Total para el cliente:** ≈ US$ 13,50 por día el primer año · US$ 9,50 desde el segundo

**Alcance:** atención, asesoramiento y cotización 24/7 con precios y stock reales de la
tienda online, envío de fotos de producto, toma de pedido, **cobro con link de Mercado
Pago y registro de comprobantes de transferencia**, derivación al equipo con aviso, y
panel de conversaciones.

**Stack:** WhatsApp Cloud API oficial vía **360dialog en modalidad de convivencia** (el
número sigue en el celular del local — es la condición que puso el cliente), motor
**Claude Haiku 4.5**, catálogo sincronizado desde su tienda (WooCommerce), servidor
24/7 y base de datos.

**Fuera de alcance, a cotizar aparte:** Instagram, stock desde planilla en OneDrive,
campañas de mensajes salientes, agenda de visitas.

## Regenerar el PDF

El PDF sale del HTML con Chromium headless. El archivo es un fragmento (sin `<html>`),
así que primero se envuelve:

```bash
S=.  # carpeta de este README
{ printf '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>';
  cat "$S/presupuesto-2paginas.html";
  printf '</body></html>'; } > /tmp/p.html

/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox \
  --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$S/Presupuesto_OrquestaIA_OutletMarket.pdf" \
  --virtual-time-budget=6000 file:///tmp/p.html
```

⚠️ **Verificar siempre que queden 2 páginas** después de editar. El bloque
`@media print` del HTML es el que controla el ajuste; si se agrega contenido hay que
apretar ahí.

## Pendientes

- [ ] **Confirmar la tarifa exacta de Meta por mensaje para Uruguay** antes de dejarla por
      escrito en una propuesta. La página oficial de tarifas devuelve 403 desde el entorno;
      los valores del cuadro son de orden de magnitud para "resto de Latinoamérica".
- [ ] Pedir las **credenciales de producción de Mercado Pago** — el cobro quedó dentro del
      alcance.
- [ ] Definir con el cliente **cómo se maneja el stock de unidades únicas** (cada
      electrodoméstico de outlet tiene su propio defecto estético; no es un SKU con N
      iguales). Es la pregunta técnica que más los va a impresionar.
- [ ] Si eligen stock por planilla en OneDrive, **cotizar aparte** (≈ 2 días de trabajo).
