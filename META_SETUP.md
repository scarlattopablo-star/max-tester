# Migrar Max de Baileys a la WhatsApp Cloud API oficial (Meta) — con Coexistence

Esta guía es para **Pablo**. Son los clics que solo podés hacer vos (sos el admin de
Meta Business y el de la tarjeta). Cuando termines los pasos 1–6 me pasás los **3 datos
del paso 6** y yo prendo a Max en la API. El código YA está listo del lado nuestro.

> **Tranquilo:** mientras hacés todo esto, **Max sigue funcionando en Baileys como siempre.**
> Nada se corta hasta el último paso (el "corte"), que coordinamos con el equipo presente.

---

## Antes de empezar — qué es Coexistence

El **091 629 784** va a quedar **al mismo tiempo en la app de WhatsApp del celular Y en
la API** (Max). No se borra nada, no se pierde ningún chat, e incluso se importan hasta
6 meses de historial. Requisito: el 091 tiene que estar en la app **WhatsApp Business**
(la de la maletita), no en el WhatsApp común. Si está en el común, se pasa a Business app
(gratis, conserva los chats) antes de empezar.

---

## Paso 1 — Verificar el negocio en Meta Business
1. Entrá a **business.facebook.com** → **Configuración del negocio** (Business Settings).
2. **Centro de seguridad** (Security Center) → **Verificación del negocio** → iniciar.
3. Subí los datos de la empresa (Everbox SA): nombre legal, dirección, teléfono. Meta
   puede pedir un documento (RUT/constancia) o una factura de servicio.
4. ⏳ Esto tarda de **unas horas a 2–3 días**. Se puede avanzar con el resto mientras tanto.

## Paso 2 — Crear la cuenta de WhatsApp (WABA)
1. En **developers.facebook.com** → **Mis apps** → **Crear app** → tipo **Business**.
2. Dentro de la app, agregá el producto **WhatsApp** → **Configurar**.
3. Se te crea una **WhatsApp Business Account (WABA)**. Anotá el **WABA ID**.

## Paso 3 — Agregar el 091 con Coexistence
1. En **WhatsApp** → **API Setup** (Configuración de la API) → **Agregar número de teléfono**.
2. Elegí la opción de **Coexistence / conectar un número de la app de WhatsApp Business**
   (Meta te muestra un **QR**: lo escaneás desde el celu del 091 con
   *WhatsApp Business → Configuración → Dispositivos vinculados → Vincular dispositivo*).
   - ⚠️ Si NO te aparece la opción de Coexistence, avisame antes de seguir: hacemos la
     migración clásica (esa sí pide sacar el número de la app) y lo coordinamos distinto.
3. Confirmá el **nombre para mostrar**: `La Casa del Cubreasiento`. Meta lo revisa (suele
   ser rápido). Para que el nombre se vea siempre en el encabezado, más adelante conviene
   **Meta Verified** (pago, opcional).
4. Anotá el **Phone Number ID** del 091 (aparece en API Setup, al lado del número).

## Paso 4 — Token PERMANENTE (System User)
El token que muestra "API Setup" es **temporal (24 h)**: no sirve para producción.
1. **Business Settings** → **Usuarios** → **Usuarios del sistema** → **Agregar**.
   Nombre: `max-bot`, rol **Admin**.
2. **Agregar activos** → asignale la **WABA** del paso 2 con **control total**.
3. **Generar nuevo token** → elegí la app del paso 2 → marcá los permisos
   **`whatsapp_business_messaging`** y **`whatsapp_business_management`**.
4. Elegí caducidad **"Nunca"** (token permanente). **Copialo y guardalo** (no se vuelve a
   mostrar). Este es el **WHATSAPP_TOKEN**.

## Paso 5 — Cargar la tarjeta (medio de pago)
1. **Business Settings** → **WhatsApp Manager** → tu WABA → **Configuración de pagos**
   (Billing) → agregar **tarjeta**.
2. Sin tarjeta, Max contesta a quien escribe pero no podés mandar promos/plantillas.
   (Las respuestas a quien te escribió son muy baratas o gratis; las promos se cobran.)

## Paso 6 — Pasame ESTOS 3 datos
Cuando tengas:
- **WHATSAPP_TOKEN** = el token permanente del paso 4
- **WHATSAPP_PHONE_ID** = el Phone Number ID del paso 3
- **WHATSAPP_VERIFY_TOKEN** = una palabra secreta que **inventás vos** (ej: `maxcubre2026`)

Yo los cargo en Render y conecto el **webhook** del lado de Meta (te paso una URL tipo
`https://max-tester.onrender.com/webhook` y la palabra secreta; vos solo confirmás un clic
de "Verificar y guardar" y tildás el evento **messages**).

---

## El "corte" (cuando ya está todo verificado) — coordinado con el equipo
Con Coexistence el corte es suave (minutos) y el celu sigue andando todo el tiempo:
1. Aviso al equipo que por unos minutos Max puede demorar.
2. En Render: pongo `WA_PROVIDER=meta` y saco `WHATSAPP_ON` (apago Baileys).
3. Verifico que entren y salgan mensajes de prueba por la API.
4. Listo: Max atiende por la API oficial. El equipo sigue viendo y respondiendo desde:
   - la **app del celular** (Coexistence), y/o
   - la **bandeja de Meta Business Suite** (app/PC), y/o
   - el panel **/admin** nuestro.

## Qué tiene que hacer el equipo el lunes en el local
1. Tener el **celular del 091 a mano** (para escanear el QR del paso 3 y, si hiciera falta,
   leer un código de verificación).
2. Confirmar que el 091 está en la app **WhatsApp Business** (maletita). Si está en el
   común, lo pasamos a Business app (gratis, conserva chats) — me avisan y los guío.
3. Aprender la **bandeja de Meta Business Suite** para los handoffs (cuando Max deriva a
   un humano). Les dejo el paso a paso aparte.

## Notas de operación
- **NUMERO_AVISOS**: los avisos de Max al equipo (derivación/venta/turno) conviene que vayan
  a un **número de asesor distinto del 091** (la API no se puede mandar mensajes a sí misma).
  Decime a qué número los mando y lo dejo configurado.
- **Ventana de 24 h**: Max responde libre a quien escribió en las últimas 24 h. Para escribir
  después (promos, reenganche) se usan **plantillas aprobadas** (ver `PLANTILLAS_WHATSAPP.md`).
- **Rollback**: migrar el 091 a la API es casi de ida. Con Coexistence el riesgo es mínimo
  porque la app del celu nunca deja de funcionar.
