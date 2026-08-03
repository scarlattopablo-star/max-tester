# Max: stock agotado, avisos de reposición y cuándo derivar

**2 de agosto de 2026** · pedido de Pablo Scarlatto · ✅ en producción

Este documento reemplaza al borrador que quedó fuera del repo (`docs/superpowers/specs/`).
Refleja el estado FINAL, después de los ajustes que fue pidiendo el dueño esa misma noche.

## El problema

Cuando un cliente preguntaba por un producto que Max no encontraba, Max lo derivaba a un asesor.
Eso pasaba en tres situaciones muy distintas que se trataban igual:

1. El producto existe pero está **pausado** en Mercado Libre → el cliente se iba creyendo que no
   lo tenemos, y cuando la mercadería llegaba nadie le avisaba. Venta perdida.
2. El producto **no existe** → se cargaba al equipo con una consulta que solo podía terminar en un "no".
3. Peor todavía: Max derivaba **sin siquiera buscar**, así que el asesor recibía consultas que el
   propio Max podía cerrar.

## Qué hace ahora

| Situación en Mercado Libre | Respuesta de Max |
|---|---|
| Activa con stock | vende, sin cambios |
| **Pausada** o con stock 0 | "ahora no hay, está por llegar" + ofrece avisarle. Si acepta, queda anotado |
| **No existe** — alfombra, cubreauto, accesorio | "estamos sin stock por ahora". No deriva |
| **No existe** — cubreasientos, o cubreasientos JMC | como siempre: ofrece las líneas y deriva |

Cuando la publicación vuelve a estar activa con stock, sale **un** WhatsApp al cliente
preguntándole si sigue interesado. Las esperas de más de **90 días** se vencen solas.

**Supuesto asentado:** cuando el stock llega a 0, Mercado Libre pausa la publicación sola, así que
"pausada" y "activa con stock 0" son la misma situación y el código las trata igual.

## Cómo habla

- ⛔ Prohibidas las palabras **publicado, catálogo, sistema, lista, base de datos** con el cliente.
  Son palabras de adentro y suenan a excusa de robot. Se habla de stock: "estamos sin stock por
  ahora", "esa la tenemos agotada".
- ⛔ Contesta **sobre el producto que le pidieron**. Si preguntan por alfombras, no salta a ofrecer
  cubreasientos.
- ⛔ No repregunta si el nombre del auto es la marca o el modelo: busca la palabra tal cual. Los
  títulos del catálogo vienen completos, así que "nammi" encuentra la del Dongfeng Nammi.
- ⛔ Nunca dice que no trabajamos **el vehículo**: como mucho, que ese producto puntual no lo hay.

## Cuándo deriva (y cuándo no)

- 🔒 **Guard por código:** `derivar_a_humano` queda BLOQUEADO si en ese turno Max no llamó antes a
  `enviar_foto` o `consultar_precio`. Fue la única forma confiable — el prompt no le ganaba: Max
  derivaba sin llamar a ninguna herramienta. Los motivos que no son de producto (`pide_humano`,
  `reclamo`, `mayorista`, `alto_valor`, `negociacion`) pasan derecho.
- La derivación **se ofrece, no se impone**: primero asesora, y si hace falta una persona pregunta
  "¿querés que le pase tu consulta a un asesor?" y deriva solo si el cliente acepta. La excepción
  es cuando el cliente pide hablar con alguien: eso se deriva en el acto.
- ⚠️ Una derivación bloqueada **igual aparece** en `acciones`. Al testear hay que filtrar por
  `resultado.ok !== false`, si no se cuentan intentos en vez de derivaciones.

## Arquitectura

**El sync trae también lo caído.** `sync_ml.js` pedía solo `status=active` y descartaba el resto.
Ahora pide también `status=paused` y reparte en dos listas: el catálogo de venta de siempre, y una
lista de **agotados** que Max nunca ofrece ni cotiza. Los productos guardan el `id` de la
publicación (antes solo el permalink): es lo que ata una espera a un producto concreto. Los precios
reales vía `/prices` se piden solo para los activos.

**La lista de espera.** Tabla `esperas` en Neon (`telefono`, `item_id`, `titulo`, `estado`,
`creada`, `avisada_en`), con `unique (telefono, item_id)`: si el mismo cliente vuelve a preguntar,
la espera se revive en vez de duplicarse.

**El disparo.** Al final de cada sync (cada 30 min) se vencen las de más de 90 días, y de las
pendientes se mira si su `item_id` volvió al catálogo activo. Mirar solo lo que alguien espera —en
vez de comparar catálogos entre corridas— evita el falso positivo del primer sync tras un deploy.

**La plantilla.** El aviso sale días después, o sea fuera de la ventana de 24 h: Meta exige
plantilla aprobada. `volvio_stock_max` (MARKETING, `es`) está **aprobada**. Su pie promete la baja,
y eso se cumple por código: un mensaje que ES la baja marca `opt_in = false` en `handler.js` sin
pasar por la IA, y `esperas.js` no le escribe a quien se dio de baja. Si el envío falla, la espera
queda pendiente y se reintenta en el próximo sync: no se pierde ningún cliente.

## Fuera de alcance (decisiones explícitas)

- **Colores:** el corte es por publicación, no por variación.
- **Panel en /admin:** no va. La lista vive en la base.
- **Saber si el cliente ya compró en otro lado:** el aviso le llega igual.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/sync_ml.js` | trae pausados, guarda el `id`, reparte activos/agotados, dispara el repaso |
| `src/catalogo_vivo.js` | guarda y expone los agotados (`CATALOGO_SIN_DISCO=1` para pruebas) |
| `src/esperas.js` | tabla, alta, vencimiento y envío de avisos |
| `src/cerebro.js` | búsqueda en agotados, herramienta nueva, guard de derivación, reglas |
| `src/handler.js` | la baja de avisos, por código |
| `src/web.js` | `GET /api/agotados?q=` (mismo NOTIFY_TOKEN que /api/metricas) |

## Pruebas

| Archivo | Qué cubre |
|---|---|
| `test_esperas.mjs` | 17 casos, sin red: agotado vs inexistente, ids, altas |
| `test_baja_avisos.mjs` | 7 casos, sin red: el "BAJA" que promete la plantilla |
| `test_agotados_e2e.mjs` | 3 casos con IA real: pausado / inexistente / activo |
| `test_sin_jerga.mjs` | 5 casos con IA real: sin jerga, sin derivar de más, sin cambiar de producto |
| `test_modelos_y_retiro.mjs` | 6 casos: que no se hayan roto las reglas viejas |

⚠️ **Antes de sacar conclusiones de una prueba local, mirá que el snapshot tenga las pausadas**
(`src/productos_ml.json` → campo `agotados`). Ya pasó dos veces sacar una conclusión falsa por
probar contra una lista vacía. Para bajarlas de producción: `GET /api/agotados`.
