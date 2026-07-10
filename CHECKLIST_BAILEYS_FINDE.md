# Checklist FASE 1 — Volver Max de Meta a Baileys (corte de fin de semana)

**Objetivo:** que el 091 vuelva a la **app de WhatsApp Business del celular** (el equipo lo usa como antes) con **Max respondiendo por Baileys** (dispositivo vinculado). Gratis, sin panel, sin BSP. De paso deja el número listo para Coexistence (FASE 2) más adelante.

**Cuándo:** un rato tranquilo (poco movimiento), con el **celular del 091 en la mano** y coordinado con Pablo. Reservá ~1 hora por si WhatsApp pide esperas.

**Trade-off asumido:** vuelve el bug #1723 (algunos PRIMEROS mensajes de anuncios no llegan hasta contestar a mano). Se mitiga con el "Mensaje de bienvenida" (paso 6) y contestando a mano el 1er mensaje de un lead de anuncio.

---

## Ya está preparado (código) ✅
- El código de Baileys sigue intacto en el repo: `src/whatsapp.js` (con los fixes de junio: última versión del protocolo + backoff + browser name). El handoff funciona (`marcarHumano` en whatsapp.js:411 — cuando un asesor contesta a mano, Max se pausa en ese chat).
- El switch de proveedor está en `src/start.js`: arranca Baileys si `WA_PROVIDER` ≠ "meta" **y** `WHATSAPP_ON=1`.
- Las variables que Baileys necesita YA están en Render (ANTHROPIC_API_KEY, DATABASE_URL, NOTIFY_TOKEN, ML_*, MP_ACCESS_TOKEN, APP_URL, IA_PROVIDER=claude). El modelo es Sonnet 5 (hardcodeado en config.js). No hay que cargar nada nuevo salvo el paso 4.

---

## PASOS DEL FINDE (en orden)

### 1. (Antes de empezar) Confirmar el PIN de verificación en 2 pasos
- El 091, al estar en la Cloud API, puede tener un **PIN de 6 dígitos** (verificación en 2 pasos) puesto durante la migración. Al registrarlo en el celular, WhatsApp puede pedirlo.
- Si Pablo lo tiene anotado, tenerlo a mano. Si no, se puede resetear (WhatsApp manda código por SMS, a veces con espera de hasta 7 días — por eso conviene chequear esto ANTES).

### 2. Sacar el 091 de Meta (⚠️ punto de compromiso)
- En **business.facebook.com** → Administrador de WhatsApp → cuenta "LA CASA DEL CUBREASIENTO" → Números de teléfono → el +598 91 629 784 → **eliminar/desconectar el número** de la WABA.
- Esto lo **deregistra de la Cloud API** y libera el número para el celular.
- ⚠️ Desde acá, volver a Meta = re-hacer la migración (no es un clic). Por eso hacelo cuando tengas tiempo de completar TODO el corte en la misma sesión.

### 3. Activar el 091 en la app de WhatsApp Business del celular
- Instalar **WhatsApp Business** (la de la maletita — NO la común; importante para que quede lista para Coexistence en Fase 2) en el celular del 091.
- Registrar el 091 → llega **código por SMS** → confirmar. Si pide el PIN de 2 pasos, es el del paso 1.
- Configurar el perfil (nombre, foto). El equipo ya puede ver/usar el WhatsApp como antes.

### 4. En Render: prender Baileys
- dashboard.render.com → servicio **max-tester** → Environment:
  - **Agregar** `WHATSAPP_ON` = `1`
  - **Quitar** (o dejar en blanco) `WA_PROVIDER` (hoy está en `meta`)
  - (Las variables WHATSAPP_TOKEN/PHONE_ID/VERIFY_TOKEN pueden quedar, no molestan.)
- Guardar → esperar el deploy (o Manual Deploy → Deploy latest commit).

### 5. Vincular Max (escanear el QR)
- Abrir en el navegador: `https://max-tester.onrender.com/qr?clave=<NOTIFY_TOKEN>`
  (el token es el `NOTIFY_TOKEN` de Render; el mismo del panel).
- En el celular: **WhatsApp Business → Configuración → Dispositivos vinculados → Vincular dispositivo** → escanear el QR de la pantalla.
- Max queda como dispositivo vinculado. La página muestra "conectado" cuando engancha.

### 6. Mitigación del bug de anuncios (#1723)
- En la app **WhatsApp Business** del celular → Herramientas para la empresa → **Mensaje de bienvenida** → activarlo (ayuda a destrabar el 1er mensaje de anuncios).
- Avisar al equipo: si un lead de anuncio "no aparece", contestarle **una vez a mano** desde el celular destraba el chat y Max sigue.

### 7. Probar de punta a punta
- Desde **otro teléfono**, escribirle al 091 → Max debe responder.
- Que un **asesor conteste a mano** un chat desde el celular → Max debe **pausarse** en ese chat (no pisar al asesor).
- `https://max-tester.onrender.com/api/estado` → `whatsapp.conectado: true`.

---

## Rollback (si algo sale mal en el corte)
- Reversión fácil (solo Render): volver a poner `WA_PROVIDER=meta` y quitar `WHATSAPP_ON` → Max vuelve a intentar por Meta. **PERO** si ya sacaste el número de Meta (paso 2) y lo pusiste en el celular (paso 3), volver a Meta requiere re-migrar (re-registrar en la Cloud API + recargar token/phone-id). Por eso el paso 2 es el de compromiso: hacerlo con tiempo.

---

## FASE 2 (más adelante, sin apuro) — Baileys → Coexistence
Con el número ya en la app de WhatsApp Business (gracias a esta Fase 1), recién ahí se puede hacer el onboarding de **Coexistence**: se conecta la Cloud API oficial SIN sacar el número de la app, Max pasa de Baileys a la API oficial, y el equipo sigue con la app. Resultado final: app como antes + 100% de anuncios + Max + sin panel. Incógnita: el onboarding directo de Coexistence puede pedir un Tech Provider/BSP; si no aparece la opción directa, se hace vía un BSP (Wati/360dialog). El handoff para ese modo YA está en el código (`smb_message_echoes` → pausa a Max, commit dfb07aa).
