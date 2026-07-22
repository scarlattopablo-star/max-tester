# Migración de Max a la Cloud API de Meta con COEXISTENCE — runbook para mañana

> **Objetivo:** que el 091 629 784 quede en la **API oficial de Meta** (Max deja de banearse)
> **SIN perder el uso desde la app de WhatsApp Business** del celular del local. Eso = **Coexistence**.
> Regla de oro: **si la opción Coexistence NO aparece, FRENAR. No hacer migración clásica** (esa borra
> el número de la app, que es justo lo que NO queremos).

## Estado al cerrar hoy (20 jul 2026)
- Max **apagado**: `WHATSAPP_ON=0` en Render (Baileys ni arranca, `on:false`, `hayQr:false`). ✅
- El 091 está **restringido por WhatsApp unas horas** (baneo temporal por Baileys). **No reescanear Baileys.**
- Token permanente `max-bot`: **válido** (verificado por Graph API hoy).
- WABA `464966823369407`: **sin número conectado** (phone_numbers vacío) → hay que agregar el 091.
- Código Max: **listo y gateado** — webhook en `/webhook`, se activa con `WA_PROVIDER=meta`.

## PRE-REQUISITOS para arrancar mañana (chequear ANTES)
1. ⏳ **El 091 tiene que estar SIN restricción.** Probá mandar un WhatsApp normal desde el celu: si sale, ya está libre. Si no, esperar.
2. 📱 El 091 tiene que estar en la app **WhatsApp Business** (la de la maletita), NO el WhatsApp común. Si está en el común: pasarlo a Business (gratis, conserva chats).
3. 📞 Tener el **celular del 091 a mano en el local** (para escanear el QR de Coexistence y/o leer un SMS).
4. 🔢 Decidir **NUMERO_AVISOS** = un número de asesor **distinto del 091** (la API no se manda mensajes a sí misma). Anotarlo acá: `NUMERO_AVISOS = 096 895 164` (confirmado por Pablo 21 jul)

## PASO 1 — Coexistence (lo hace Pablo en Meta)
1. business.facebook.com → **WhatsApp Manager** → WABA "LA CASA DEL CUBREASIENTO" → **Números de teléfono** → **Agregar número**.
2. Buscar la opción **Coexistence / "conectar un número de la app de WhatsApp Business"**.
   - ✅ Si aparece → Meta muestra un **QR** → escanearlo desde *WhatsApp Business del 091 → Configuración → Dispositivos vinculados → Vincular dispositivo*.
   - ❌ Si NO aparece → **PARAR y avisar a Claude.** No seguir con la migración clásica.
3. Nombre visible: **`La Casa del Cubreasiento`** (NO todo en mayúsculas, Meta lo rechaza así).
4. Anotar el **Phone Number ID del 091** (aparece en API Setup, al lado del número): `WHATSAPP_PHONE_ID = 1175509025649241` ✅ (091 629 784, capturado por Graph API 21 jul; estado PENDING/NOT_VERIFIED)

## ⚡ GO-LIVE POR 360DIALOG (camino vigente desde 21 jul — reemplaza Pasos 2 y 3 de abajo)
El 091 se conectó por Coexistence vía 360dialog (client eQPv2O8gCL). Cuando el canal aparezca
en el hub y tengamos la **D360-API-KEY** (soporte de 360dialog mediante, ticket ya abierto):
1. Render (https://dashboard.render.com/web/srv-d8h3t042m8qs73akpp60/env):
   - `WA_PROVIDER = meta` · `D360_API_KEY = <la key>` · `NUMERO_AVISOS = 59896895164`
   - `WHATSAPP_ON` fuera/0. (WHATSAPP_TOKEN/PHONE_ID pueden quedar: D360_API_KEY tiene prioridad.)
2. Webhook (NO se toca developers.facebook.com): `node set_webhook_360.mjs` (usa la key del .env).
3. Verificar: /api/estado + mensaje real de un cliente externo + que la charla aparezca en la app del celu.
El código ya soporta 360dialog (meta_api.js detecta D360_API_KEY: /messages sin phone_id,
header D360-API-KEY, media por su proxy). Tests OK.

## PASO 2 — Render (lo hace Claude apenas Pablo pase el Phone ID)
Panel: https://dashboard.render.com/web/srv-d8h3t042m8qs73akpp60/env — setear:
- `WA_PROVIDER = meta`
- `WHATSAPP_PHONE_ID = <el Phone ID nuevo del paso 1.4>`  ← ⚠️ el que hay hoy en .env (1136113499593460) es VIEJO, reemplazar
- `WHATSAPP_TOKEN` → ya está cargado y válido (no tocar)
- `WHATSAPP_VERIFY_TOKEN = maxcubre2026verify` → ya está
- `NUMERO_AVISOS = <número de asesor>` (del pre-requisito 4)
- **Sacar / dejar en 0** `WHATSAPP_ON` (apaga Baileys)
- Save → Render redeploya solo (~1-2 min). Con `WA_PROVIDER=meta` el código monta el webhook y NO arranca Baileys.

## PASO 3 — Webhook (Meta, lo confirma Pablo con 1 clic)
En developers.facebook.com → app **RePost Cubreasiento** → **WhatsApp → Configuración** → Webhook:
- **Callback URL:** `https://max-tester.onrender.com/webhook`
- **Verify token:** `maxcubre2026verify`
- Clic **Verificar y guardar** → suscribir el evento **`messages`**.

## PASO 4 — Verificación de que quedó vivo (Claude)
- `https://max-tester.onrender.com/api/estado` → tiene que reportar WhatsApp conectado por API.
- Prueba real: un cliente externo (o un celu que no sea el 091) le escribe al 091 → Max responde por la API.
  (Meta NO deja mandarse mensaje a uno mismo, así que el self-test no sirve.)

## Rollback
Con Coexistence el riesgo es mínimo: la app del celu nunca deja de andar. Si algo del webhook falla,
Max deja de responder por API pero el equipo sigue atendiendo desde la app/Meta Business Suite. Volver
a poner `WA_PROVIDER` fuera de `meta` NO reactiva Baileys solo (necesita `WHATSAPP_ON=1` + reescanear).
