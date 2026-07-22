# Plantillas de WhatsApp (mensajes fuera de las 24 h) — La Casa del Cubreasiento

Para escribirle a un cliente **después de las 24 h** de su último mensaje (promos,
reenganche de carrito), Meta exige una **plantilla aprobada**. Acá están las que vamos a
cargar. Se aprueban en **WhatsApp Manager → Plantillas de mensajes → Crear plantilla**.

> Reglas de oro para que Meta apruebe rápido: nada de promesas falsas, sin mayúsculas
> gritadas, sin links acortados raros, y la categoría correcta. Las de promo van como
> **MARKETING**; los avisos operativos (ej: "tu pedido está listo") como **UTILITY**.

---

## Plantilla 1 — Promo general (MARKETING)
- **Nombre:** `promo_general`
- **Idioma:** Español (`es`)
- **Categoría:** MARKETING
- **Encabezado (Header):** Texto → `La Casa del Cubreasiento 🚗`
- **Cuerpo (Body):**
  ```
  ¡Hola {{1}}! 👋 Tenemos una promo que te va a interesar: {{2}}.
  Cubreasientos a medida, alfombras 3D, fundas de volante y más.
  ¿Te paso info y precios para tu vehículo?
  ```
  - `{{1}}` = nombre del cliente
  - `{{2}}` = la promo del momento (ej: "15% OFF en cubreasientos a medida hasta el domingo")
- **Pie (Footer):** `Respondé STOP para no recibir más promos.`
- **Botones (opcional, recomendado):**
  - Botón de respuesta rápida: `Quiero info`
  - Botón de respuesta rápida: `STOP`

## Plantilla 2 — Reenganche de carrito (MARKETING)
- **Nombre:** `carrito_abandonado`
- **Idioma:** `es` · **Categoría:** MARKETING
- **Cuerpo:**
  ```
  ¡Hola {{1}}! Vimos que quedaste viendo {{2}} en nuestra tienda 🛒
  ¿Querés que te ayude a terminar la compra o coordinar el envío?
  ```
  - `{{1}}` = nombre · `{{2}}` = producto/modelo

## Plantilla 3 — Aviso de pedido listo (UTILITY)
- **Nombre:** `pedido_listo`
- **Idioma:** `es` · **Categoría:** UTILITY
- **Cuerpo:**
  ```
  ¡Hola {{1}}! Tu pedido de {{2}} ya está listo para retirar en Paysandú 944
  o para coordinar el envío por DAC. ¿Cómo preferís recibirlo?
  ```

## Plantilla 4 — Aviso interno al equipo (UTILITY) ⚠️ PRIORITARIA
- **Para qué:** que los avisos de Max al equipo (derivación / venta / turno) lleguen SIEMPRE
  al `NUMERO_AVISOS` (el 096 895 164). Sin plantilla, esos avisos son texto libre y Meta
  **los descarta en silencio** si el asesor no le escribió a Max en las últimas 24 h
  (status failed, code 131047). Mientras no esté la plantilla, el 096 tiene que mandarle
  un mensaje cualquiera a Max al menos una vez por día para mantener la ventana abierta.
- **Nombre:** `aviso_equipo`
- **Idioma:** `es` · **Categoría:** UTILITY
- **Cuerpo:**
  ```
  🔔 Aviso de Max: {{1}}
  ```
  - `{{1}}` = el aviso completo en una línea (el código ya lo aplana solo)
- **Dónde se crea:** en el hub de 360dialog (o WhatsApp Manager → Plantillas). Requiere
  tener fondos cargados en 360dialog para mensajes iniciados por el negocio.
- **Activarla:** una vez APROBADA, cargar en Render `PLANTILLA_AVISO=aviso_equipo` y
  redeployar. Con eso los avisos dejan de depender de la ventana de 24 h.

---

## Cómo se disparan desde el código
Una vez **aprobadas**, se mandan a toda la base (o a un segmento por etiqueta) con la
función `enviarPromo` de `src/clientes.js`. Respeta el **opt-in** (solo a quien aceptó) y
va de a uno con un respiro para no gatillar el rate-limit de Meta.

Ejemplo (probar siempre primero con `dry: true`, que NO manda nada):

```js
import { enviarPromo } from "./src/clientes.js";

// Simulación: cuenta a cuántos llegaría, sin enviar.
await enviarPromo({
  nombrePlantilla: "promo_general",
  etiqueta: "",            // "" = todos; o "hilux" para segmentar
  dry: true,
  parametros: (c) => [{
    type: "body",
    parameters: [
      { type: "text", text: c.nombre || "cliente" },
      { type: "text", text: "15% OFF en cubreasientos a medida hasta el domingo" },
    ],
  }],
});
```

Para mandar de verdad: lo mismo con `dry: false`. Devuelve `{ total, enviados, fallidos, errores }`.

> ⚠️ **Consentimiento:** la base arranca a todos con `opt_in = true` (nos escribieron
> primero). Si un cliente responde **STOP**, hay que marcar `setOptIn(telefono, false)`.
> Conviene además agregar un botón/aviso de opt-in la primera vez, para campañas grandes.
