# Artículos A PEDIDO: la disponibilidad a 21 días (2 sep 2026)

## Qué pasó

Pablo activó (y despausó) publicaciones en Mercado Libre que **se venden pero no son de
entrega inmediata**: el artículo está disponible recién **dentro de 21 días**. Para Max
esas publicaciones eran iguales a cualquier otra —activas y con stock—, así que las
cotizaba, mandaba las fotos con el precio y **cerraba la venta sin decir nada del plazo**.
El cliente se enteraba después de pagar, que es exactamente cuando un plazo se convierte
en un reclamo.

Lo que pedía Pablo: *"¿puede Max informarse de la disponibilidad de cada producto para
avisarle a la gente cuando pregunten por ese producto activo con disponibilidad de 21
días? Así le da la explicación pertinente al cliente."*

## De dónde sale el plazo

De la **propia publicación de Mercado Libre**, no de una lista aparte: es el campo
`MANUFACTURING_TIME` de `sale_terms` (lo que en el formulario de ML es la *disponibilidad
de stock* / *tiempo de fabricación*). Se pide en el multiget del sync
(`attributes=...,sale_terms`) y lo lee `diasDeDisponibilidad()` en `src/sync_ml.js`.

Se lee de las tres formas en que ML lo manda, porque no siempre vienen todas:

| Cómo viene | Ejemplo | Queda |
|---|---|---|
| Estructurado | `value_struct: { number: 21, unit: "días" }` | 21 |
| Solo texto | `value_name: "21 días"` / `"3 días hábiles"` | 21 / 3 |
| En otra unidad | `48 horas`, `2 semanas`, `1 mes` | 2, 14, 30 |
| Sin el campo, o "lo tengo listo para enviar" | — | 0 (entrega inmediata) |

**Ventaja de que salga de ML:** si Pablo cambia el plazo en la publicación, Max lo dice
cambiado en la próxima sincronización. Nadie tiene que tocar código.

**Escotilla:** si una publicación se vende a pedido pero en ML quedó sin declarar el
plazo, se carga a mano en `DEMORAS_MANUALES` (`src/config.js`), por id de publicación.
Lo cargado a mano pisa lo que diga ML.

**Cómo comprobar que ML lo está mandando:** `GET /api/estado` → `catalogo.aPedido` y
`ultimaSync.aPedido` dicen cuántas publicaciones activas tienen plazo. Si eso queda en 0
teniendo artículos a 21 días, el dato no viene de ML y hay que usar la escotilla.

## Qué hace Max con eso

El plazo viaja con cada producto (`d` en el catálogo, `demora_dias` en lo que ven las
herramientas) y **el aviso lo pone el CÓDIGO**, no el modelo — misma receta que el aviso
de colocación, el de envío y el de agotado:

1. **Al cotizar** (`consultar_precio`) y **al mandar fotos** (`enviar_foto`):
   - si **todo** lo encontrado es a pedido y con el mismo plazo → el sistema agrega el
     texto oficial `AVISO_DISPONIBILIDAD` (config.js) al final del mensaje;
   - si **solo algunas** opciones tienen demora (o los plazos difieren), un texto único
     mentiría sobre alguna: ahí se le pasa el detalle producto por producto al modelo
     para que lo aclare, y **el pie de cada foto** lo dice igual:
     `2) Alfombra Nivus Baúl - $ 2.500 (a pedido: disponible en 21 días)`.
2. **Al cerrar la venta** (`tomar_pedido`, `confirmar_transferencia`) y **al pasar el
   link de pago** (`crear_link_pago`): el aviso se repite. Es el momento en que el
   cliente decide, y el plazo del despacho (2 o 3 días, `AVISO_ENVIO`) recién corre
   cuando el artículo está.
3. **Si el modelo escribe su propio plazo**, esa oración se le cae y queda solo el texto
   oficial. ⚠️ Con red de seguridad: si la poda se llevaría el mensaje entero o el
   **precio** (Max suele meter todo junto: *"sale $ 18.000 y se entrega a los 21 días"*),
   se deja el texto como estaba. Repetir el plazo molesta; dejar al cliente sin la
   respuesta que pidió es peor.

## Lo que NO es

⛔ **A pedido no es agotado.** El artículo se puede comprar hoy. Max no dice que está sin
stock y no ofrece *"te aviso cuando llegue"* (eso es para las publicaciones pausadas o en
cero, que ni siquiera entran al catálogo de venta). Está escrito en el prompt, en la
sección *DISPONIBILIDAD: ARTÍCULOS A PEDIDO*, y en la nota interna que devuelven las
herramientas.

⛔ **No se dan fechas.** Se dice la cantidad de días que declara la publicación ("a los 21
días de la compra"), nunca un día del calendario ni un plazo más corto para no perder la
venta.

## Pruebas

- `node src/disponibilidad.test.mjs` — 21 casos, sin red ni IA (entra en `npm test`).
- `node test_disponibilidad_e2e.mjs` — conversación real contra la IA (necesita la API
  key): que avise el plazo, que no lo trate como agotado, que no invente plazos en los
  artículos que sí están en el local, y que lo repita al cerrar la venta.

## Archivos tocados

| Archivo | Qué |
|---|---|
| `src/sync_ml.js` | pide `sale_terms` y lee el plazo (`diasDeDisponibilidad`) → campo `d` |
| `src/config.js` | `AVISO_DISPONIBILIDAD` (texto para el cliente) y `DEMORAS_MANUALES` |
| `src/catalogo_vivo.js` | `infoCatalogo().aPedido` (sale en `/api/estado`) |
| `src/cerebro.js` | `demora_dias` en cada producto, `conDisponibilidad()`, avisos al cotizar y al cerrar, pie de las fotos, sección nueva del prompt |
