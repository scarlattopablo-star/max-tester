# ESTADO del Agente IA "Max" — RETOMAR ACÁ

Bot de WhatsApp (**WhatsApp Cloud API oficial de Meta** desde el 9-jul-2026; antes Baileys) + derivación de Instagram, para La Casa del Cubreasiento.
Asistente se llama **Max** (antes Vale; renombrado 4 jun). Carpeta: `agente_ia/`.

## ✅✅ SESIÓN 9–10 jul — MIGRACIÓN A META COMPLETADA (LO MÁS NUEVO)

**Max corre en la API oficial de Meta. Verificado en vivo: responde mensajes reales.**

- **Código:** commit `ff3c373` "Migración a la WhatsApp Cloud API oficial (Meta) — gateada con WA_PROVIDER=meta" (webhook `/webhook` en el server, `whatsapp_meta.js`/`meta_api.js`). Baileys quedó apagado (sin `WHATSAPP_ON`); por eso `/api/estado` muestra `whatsapp.on:false` — es lo esperado, el estado de Meta NO se refleja ahí todavía (pendiente cosmético).
- **Render (env):** `WA_PROVIDER=meta`, `WHATSAPP_TOKEN` (token permanente de System User), `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `NUMERO_AVISOS` — todo cargado.
- **Meta:** app **"RePost Cubreasiento"** (ID 2442553329591792, negocio "La Casa Del Cubreasiento", business_id 1568026806653348, developers.facebook.com con la cuenta de Pablo). Caso de uso WhatsApp con los 4 pasos de producción en verde (webhook suscrito, número registrado, pago cargado, número probado). **Verificación del negocio: APROBADA.** La app también tiene el caso de uso de Instagram.
- **App PUBLICADA (10-jul):** estaba "En desarrollo" (los webhooks solo llegaban de números con rol en la app — a Pablo le andaba por ser admin, a clientes reales no les iba a responder). Se completó lo que faltaba para publicar: **política de privacidad** en `https://max-tester.onrender.com/privacidad.html` (archivo `public/privacidad.html`, commit `421e51a`) + **categoría "Compras"** en Configuración básica → botón Publicar → "Tu app se publicó correctamente". Estado: **Publicada**.
- **IA:** **Sonnet 5** (`claude-sonnet-5`) desde el 10-jul (commit `5b00669`, preset claude de `config.js`) — se subió de Haiku 4.5 a pedido de Pablo, ya con la migración a Meta hecha. OJO presupuesto: el límite mensual Anthropic (US$200) es COMPARTIDO con Sofi/Juli y Sonnet gasta ~2-3x Haiku; si se toca el tope, subir el límite en la Consola o revertir a `claude-haiku-4-5-20251001`.
- **Pendientes menores:** (1) `/api/estado` no reporta el estado del canal Meta; (2) probar un lead real de ANUNCIO (fb/ig) — la razón de fondo de la migración era responder el 100% de los anuncios; (3) el campo "URL de Condiciones del servicio" y "Eliminación de datos" en Meta quedaron con placeholder facebook.com de la sesión anterior — se puede apuntar a páginas propias si Meta lo exige algún día.

## 🔵🔵 SESIÓN 25–27 jun — FIXES + PLAN MIGRACIÓN A API OFICIAL + HOSTING (LO MÁS NUEVO, RETOMAR ACÁ)

### Fixes hechos esta sesión (en `main`, rama `claude/max-message-response-21nigk`)
- **Saludo por código (mañana/tarde):** el modelo (Haiku) decía "buenas tardes" de mañana aunque el prompt le indicaba la hora. Se reforzó el prompt Y, sobre todo, se agregó `corregirSaludo()` en `cerebro.js` (`armarRespuesta`): reescribe de forma **determinística** el saludo del INICIO del mensaje según la hora real de Uruguay. No toca despedidas ni mensajes sin saludo.
- **Material del cubreasiento:** regla nueva en el prompt → en TODOS los cubreasientos a medida, el FRENTE es cuero ecológico y la parte de ATRÁS es **licra** (no cuero). Aplica a eco cuero y capitoneado.
- **Resiliencia IA:** `maxRetries` de 1 → 3 en los clientes OpenAI/Anthropic (`cerebro.js`) para que baches transitorios (429/529/5xx/timeout) se recuperen solos.
- **Mensaje de error más cálido:** se reemplazó "Disculpá, tuve un problemita técnico..." por "¡Perdón! Se me cruzó un cable 😅 ¿Me lo repetís?" (whatsapp.js + web.js).
- **Conexión de WhatsApp robustecida (config portada de Sofi/Buda):** `whatsapp.js` ahora (1) pide SIEMPRE la última versión del protocolo con `fetchLatestBaileysVersion` (antes usaba la default vieja → causaba caídas 440/515 y mensajes no descifrables/"vacíos"), (2) setea `browser: ["Max - La Casa del Cubreasiento","Chrome","1.0.0"]`, y (3) reconecta con BACKOFF (3s normal, 10s si code 440/515/503) con bandera `reconectando` anti-loop. Diagnóstico Max vs Sofi: misma librería (Baileys 7.0.0-rc13), pero Sofi estaba mejor configurada (última versión + browser + backoff) y mejor hospedada (Railway always-on, confirmado en su código) vs Max en Render free (se duerme). Estos cambios cierran casi toda la brecha sin migrar; el 100% de anuncios sigue siendo la API oficial.
- **Contexto del anuncio en la respuesta:** cuando un lead llega desde un anuncio, Max ahora lee el TÍTULO/CUERPO del aviso (del `externalAdReply`) y lo prefija como contexto al texto que lee el cerebro, para orientar la respuesta a ese producto (antes solo detectaba el anuncio pero no usaba el dato). Ojo: el video/reel NO viaja en el mensaje (solo título, cuerpo, miniatura y un link redirect) → no se puede "ver" el reel; sí se usa el texto del anuncio.
- **Mensajes "vacíos"/no legibles ya no se pierden:** cuando entra un mensaje sin contenido legible (`formato=vacío`, típico de un 1er mensaje de contacto nuevo/anuncio que WhatsApp no descifró), en vez de ignorarlo en silencio, Max manda UN saludo para reenganchar ("¡Hola! No me llegó bien tu mensaje, ¿me lo reenviás?"), con anti-spam de 1 vez cada 10 min por chat (Map `vaciosAvisados` en whatsapp.js). Antes esos leads se perdían (evento `ignorado_sin_texto`).
- **Lectura de más formatos de mensaje (portado de Sofi):** `textoDelMensaje` (ws_mensaje.js) ahora lee botones (`buttonsResponseMessage`), listas (`listResponseMessage`), plantillas (`templateMessage` hidratadas) y respuestas interactivas (`interactiveResponseMessage`) — formatos que antes Max ignoraba y Sofi sí leía. +4 tests en ws_mensaje.test.mjs (12 OK). NO arregla el #1723 de anuncios, pero tapa otros agujeros para "contestar todo".
- **Aclaración del cliente (25 jun):** el número de Max es TAN o MÁS antiguo que el de Buda/Sofi → se DESCARTA la antigüedad del número como causa de "FB sí, IG no". Comparado el código de Sofi (Buda-Agente, server.js, mismo Baileys 7.0.0-rc13): Sofi NO tiene ningún workaround de #1723 ni detección de anuncios; responde al jid original igual que Max. Conclusión: el problema de anuncios NO es por Render ni por el número; es la limitación intermitente #1723. Railway daría hosting always-on (~US$ 5/mes Hobby) = más estable, pero NO garantiza los anuncios. El 100% solo lo da la API oficial.
- Causa raíz original del día: la API key de Anthropic se había quedado **sin crédito** → el usuario la recargó y Max volvió a responder.

### DECISIÓN DEL CLIENTE (25 jun): preparar migración a la API OFICIAL, pero NO hacerla todavía
- **Por ahora seguimos con Baileys** y respondiendo los leads de anuncios **A MANO**. Dejar todo "medio preparado" para hacer la migración más adelante.
- **Número:** se migrará el **CHIP que ya usa el bot** (NO el 091 629 784 principal). Los anuncios ya apuntan a ese número → no hay que tocar los anuncios. Ese número, al pasar a la Cloud API, deja de funcionar en la app del celular (queda solo para el bot).
- **Técnico:** el cerebro (`handler.js` + `cerebro.js`, catálogo, precios, fotos, derivación) **se reutiliza tal cual**; se reemplaza `whatsapp.js` (Baileys) por un **webhook de la Cloud API** (recibir + enviar). Hace falta: verificación de Meta Business (1–3 días), app en developers.facebook.com (producto WhatsApp), y luego **Phone Number ID + WhatsApp Business Account ID + token permanente** (van en Render → Environment, NO al código). La memoria de conversaciones está en Neon → se conserva tras migrar.
- **Control del equipo (2 opciones, ya documentadas en el PDF):**
  - **Opción 1 (recomendada): panel web propio** — gratis, a medida. La BASE YA EXISTE: `web.js` tiene `/conversaciones` (ver charlas). Falta completarlo para **responder/tomar el control** desde ahí (con la misma lógica de handoff de `previas.js`: cuando un humano escribe, Max se pausa).
  - **Opción 2: bandeja externa tipo app** (Wati ~US$ 49/mes, Respond.io ~US$ 79/mes; varias suman ~20% de recargo por mensaje). App tipo WhatsApp para los asesores; hay que integrar Max.
- **Costos (Uruguay/Resto LatAm, 2026):** responder anuncios = GRATIS (ventana 72 h del Click-to-WhatsApp) y responder clientes = GRATIS (ventana 24 h). Solo se paga lo que el negocio INICIA: marketing template **US$ 0,0777** c/u, utility **US$ 0,0119** c/u. La IA Claude cuesta **~US$ 50/mes** (consumo real informado por el cliente) y es **independiente del canal** (igual con Baileys o con la API oficial); subiría algo al atender más leads.
- **PDF entregado al cliente (para presentarle a Rodrigo Delfino):** `Max_WhatsApp_API_Oficial_vs_Actual.pdf` (cómo funciona, control del equipo con las 2 opciones, costos con escenarios, plan de 5 pasos). Generado con reportlab; el script quedó en el scratchpad (efímero) — si hay que regenerarlo, rehacer con reportlab.

### 🔎 INVESTIGACIÓN (25 jun): "Facebook sí contesta, Instagram no"
- Observación del cliente: un lead que vino de un anuncio de **Facebook** se respondió, pero los de **Instagram** no.
- **Conclusión:** es la MISMA limitación **#1723** de WhatsApp (retiene el PRIMER mensaje de anuncios hasta una respuesta MANUAL desde el teléfono / hasta guardar el contacto). La issue oficial de Baileys trata FB e IG **juntos, sin diferencia y SIN workaround** (issue abierta). Es **intermitente**: por eso uno pasa y otro no — NO es una regla "FB sí / IG no". **No hay fix de código confiable** del lado de Baileys.
- **Mitigaciones mientras seguimos con Baileys:** (1) responder a mano la 1ra vez (lo que ya hacen) → destraba y Max sigue; (2) activar **"Mensaje de bienvenida"** de WhatsApp Business en el teléfono del bot (puede destrabar la entrega); (3) verificar en **`/api/diag?clave=NOTIFY_TOKEN`** qué llega realmente (evento "recibido" con `anuncio` fuente fb/ig, `esLid`, `tel`) para confirmar si los de IG ni siquiera llegan.
- **La única solución de fondo para el 100% de los anuncios (FB e IG) es la API oficial** → refuerza la decisión de migrar.

### 🚉 DECISIÓN DE HOSTING (25 jun): mover Max a Railway (recomendado), NO mover Sofi a Render
- **Max → Railway = lo mejor.** Railway es always-on (no se duerme como Render free). Con la config nueva (última versión + backoff) Max quedaría a la par de Sofi. Ventajas: conexión 24/7 estable, menos mensajes perdidos, **auto-deploy con cada `git push`** (en Render no andaba el webhook → había que "Deploy latest commit" a mano), el número es el mismo, y como la sesión de Max vive en Neon (`DATABASE_URL` → `useDBAuthState`) **probablemente NO haga falta reescanear el QR**. Costo ~US$ 5/mes (Hobby). Variables a cargar en Railway: ANTHROPIC_API_KEY, DATABASE_URL, NOTIFY_TOKEN, ML_CLIENT_ID/SECRET, MP_ACCESS_TOKEN, APP_URL, WHATSAPP_ON=1, IA_PROVIDER=claude, IA_MODEL.
- **Sofi → Render = NO.** Render free se duerme → Sofi empezaría a tener los problemas de Max. No mover lo que funciona. Sofi confirmado en Railway (su server.js maneja el apagado de Railway).
- **Hosting (Railway) y API oficial son cosas distintas:** Railway = estabilidad (ya, ~US$5/mes); API oficial = recibir el 100% sin baneo (más adelante). No se pisan.

### 🆕 DELIVERABLES Y CÓMO PROBAR (25 jun)
- **PDF actualizado** `Max_WhatsApp_API_Oficial_vs_Actual.pdf` (entregado al cliente, para Rodrigo): suma la **maqueta del Panel del Equipo** (imagen incrustada), una sección de **Beneficios de pasar de Baileys a Meta** (encabezada por "responde el 100% de los mensajes, no solo anuncios"), y **costos un poco inflados** a pedido del cliente (IA ~US$70/mes, total ~US$75–90, escenarios 75-90 / 110-130 / 150-180, bandeja externa US$60–140+). Generado con reportlab (scripts en scratchpad EFÍMERO: `gen_pdf_whatsapp.py` + maqueta `panel_equipo.html`→`panel_equipo.png` con chromium headless). ⚠️ Al regenerar, mantener estos números/estructura.
- **Maqueta del panel** (`panel_equipo.png`): lista de conversaciones con etiquetas (🤖 Max atendiendo / 🧑 Atiende: <nombre> / 📣 vino de anuncio) + chat abierto + botón "Tomar la conversación" (Max se pausa solo). Es el ejemplo visual de la Opción 1.
- **Cómo ver/probar a Max:** (1) **Chat de prueba web:** https://max-tester.onrender.com (raíz, `chat.html`) — prueba el CEREBRO, no la conexión WA. (2) **WhatsApp real:** escribir al chip desde otro teléfono. (3) **Diagnóstico:** `/api/diag?clave=NOTIFY_TOKEN` (recibido→respondido por mensaje), `/api/estado` (whatsapp.conectado/hayQr/keepAlive, catálogo, IA). NOTIFY_TOKEN está en Render → Environment.

### 🔧 ESTADO AL CIERRE (27 jun) — RETOMAR ACÁ
- Todos los cambios de esta sesión están en `main` (último commit `572982b` "Conexión WhatsApp robustecida…") y en la rama `claude/max-message-response-21nigk`. **PENDIENTE: redeployar en Render** para que tomen efecto (Render no auto-deploya; "Manual Deploy → Deploy latest commit"). Hubo una desconexión de WhatsApp (conectado:false, hayQr:false) — la config nueva (última versión del protocolo) debería ayudar a reconectar estable.
- ⚠️ NO puedo deployar yo: el panel de Render necesita login del usuario, el Deploy Hook está en la PC del usuario (gitignored), y el entorno de Claude tiene bloqueado api.render.com/onrender.com (403). El deploy lo hace el usuario.
- **PRÓXIMOS PASOS sugeridos (en orden):** (1) redeploy en Render y probar con un lead real de anuncio + chat de prueba; (2) si querés estabilidad total, mover Max a Railway (~US$5/mes); (3) más adelante, API oficial de Meta (todo ya documentado en el PDF y arriba).

## 🟢🟢 SESIÓN 12 jun — SYNC ML EN VIVO RESUELTO
- **✅ CREDENCIALES ML CARGADAS:** se creó la app **"Max Cubreasiento Sync"** en developers.mercadolibre.com.uy con la cuenta **EVERBOX S.A.** (App ID `4018742690592031`). `ML_CLIENT_ID` + `ML_CLIENT_SECRET` cargadas en Render → Environment. `/api/estado` muestra `syncML:true` y `mercadoPago:true` (el `MP_ACCESS_TOKEN` ya estaba cargado, empieza con `APP_USR-`).
- **✅ FIX DEL ENDPOINT DE SYNC:** el viejo `/sites/MLU/search?seller_id=` ahora da **403** (ML restringió la búsqueda pública). Se reescribió `src/sync_ml.js` para usar el método soportado: **`/users/{seller}/items/search?status=active`** (IDs) + **multiget `/items?ids=...`** (detalles). El `/sites/search` quedó como respaldo. Verificado en vivo vía `/api/sync-ahora`: `ok:true`, `motivo:"ok (users/items)"`, **270 publicaciones**, `fuente:"api-ml"`. Se actualiza solo cada 6 h.
- **Diagnóstico nuevo:** `/api/estado` ahora incluye `ultimaSync` (ok/motivo/cuándo/cantidad) y se agregó **`/api/sync-ahora`** (fuerza la sync y devuelve el resultado) para verificar sin revisar logs.
- **`.env.example` documentado** con `MP_ACCESS_TOKEN`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `APP_URL`, `IA_MODEL`.
- Commit: 865eb53 (en `main`, desplegado en Render). **Pendiente que sigue:** Instagram oficial (API de Meta) — decisión del cliente: ¿vende completo en IG o deriva a WhatsApp?

## 🟣🟣 SESIÓN 9 jun (anterior)
- **Link en vivo:** https://max-tester.onrender.com · Estado de config en vivo: **/api/estado** (muestra catálogo, syncML, mercadoPago).
- **REGLAS DE NEGOCIO NUEVAS (pedido del cliente, implementadas y en vivo):**
  1. **ENVÍOS SOLO POR DAC** (agencia): al elegir envío, Max pide NOMBRE + TELÉFONO + DIRECCIÓN. Config en `config.js` → `ENVIOS`.
  2. **Cubreasientos, DOS LÍNEAS** (`config.js` → `CUBREASIENTOS`): **eco cuero** $6500–6800 SOLO VENTA (no se coloca, sin descripción extra) vs **capitoneado premium** (SÍ se coloca; costo de colocación lo cotiza un VENDEDOR → derivar).
  3. **Colores capitoneado: NEGRO o ROJO** con FOTOS REALES del material en `public/capitoneado/` (negro.jpg, rojo.jpg, detalle.jpg, espuma.jpg) — tool **`mostrar_capitoneado`** las manda (también con que:"espuma" para el detalle de espuma 8mm). Fuente de las fotos: Desktop\publicidad...\CUBREASIENTOS_HILUX\WhatsApp Image 2026-06-09*.
  4. **LOGO bordado opcional**: colores ROJO/NEGRO/GRIS/AZUL.
  5. **CIERRE de compra capitoneado**: confirmar AÑO del auto + COLOR capitoneado + LOGO sí/no y color → pago.
  6. **DESCRIPCIÓN del material** (espuma 8mm, impermeable, garantía 1 año, importado): SOLO capitoneado y DESPUÉS de que lo elige. El económico no lleva.
  7. **Al confirmar compra**: ofrecer el resto de artículos del modelo con link a la tienda ML filtrada: `https://listado.mercadolibre.com.uy/<Modelo>_CustId_164590340` (helper `tiendaMLPorModelo()`). Verificado: da 200.
  8. **Cabina simple/doble NO bloqueante** y solo para ALFOMBRAS de camioneta; cubreasientos piden AÑO (no cabina).
- **🔗 LINK DE PAGO MERCADO PAGO GENERADO POR MAX:** tool **`crear_link_pago`** (`src/pagos.js`, Checkout Pro /checkout/preferences) crea un link por el MONTO EXACTO con título producto+modelo+año. ⏳ **Falta `MP_ACCESS_TOKEN`** (token de producción de la cuenta MP del negocio) → hasta entonces Max deriva con elegancia. El token lo pega EL USUARIO (en Render → Environment y en .env local); Claude no maneja credenciales.
- **🔄 SYNC AUTOMÁTICO CON API OFICIAL ML:** `src/sync_ml.js` (grant client_credentials, sin OAuth de usuario) + `src/catalogo_vivo.js` (catálogo en memoria, reemplaza al import estático en cerebro.js). `web.js` corre `programarSync(6)` al arrancar: sincroniza al boot y cada 6 h; guard anti-pisada (si la API devuelve <30 items no reemplaza). ⏳ **Faltan `ML_CLIENT_ID` + `ML_CLIENT_SECRET`**: crear app en developers.mercadolibre.com.uy (Mis aplicaciones → Crear aplicación, redirect https://max-tester.onrender.com) con la cuenta Everbox y pegar credenciales en Render Environment + .env. Mientras tanto usa el snapshot (270 productos, 7 jun).
- **ejecutarHerramienta ahora es ASYNC** (await en el loop de responder) por crear_link_pago.
- **PLAN MAÑANA (en orden):** (1) crear app ML → pegar credenciales → verificar /api/estado syncML:true y que el catálogo se refresque; (2) token MP → mercadoPago:true → probar un link de pago real (monto chico); (3) DESPUÉS: Instagram oficial (API de Meta) — decisión pendiente del cliente: ¿vende completo en IG o atiende y deriva a WhatsApp? Plan: app en developers.facebook.com + webhook en el server + revisión de Meta. NO usar librería no oficial con el IG principal (riesgo de baneo).
- Commits clave: bc25098 (capitoneado+MP+syncML), dd53bbf (reglas DAC/dos líneas/cierre). 

## 🟢🟢 SESIÓN 7 jun (tarde/noche) — (anterior)
- **Link en vivo:** https://max-tester.onrender.com
- **AUTO-DEPLOY RESUELTO con DEPLOY HOOK:** el auto-deploy nativo de Render por webhook de GitHub NO dispara (el repo no tiene el webhook; arreglarlo requiere reconectar GitHub con OAuth del usuario). Solución: se usa el **Deploy Hook** de Render (URL privada guardada en `agente_ia/.deploy_hook`, gitignored). Hay un git hook **`.git/hooks/pre-push`** que tras cada `git push` dispara el Deploy Hook (curl con 6s de delay). ⇒ **Ahora alcanza con `git push` y se redespliega solo.** (Si el hook se pierde, recrearlo; o disparar manual: `curl -s "$(cat agente_ia/.deploy_hook)"`). El Auto-Deploy del panel quedó en "On Commit".
- **CATÁLOGO ACTUALIZADO: 270 productos** (antes 232) en `src/productos_ml.json`. Re-scrapeado de ML (cuenta Everbox, seller_id 164590340) leyendo `window._n.ctx.r.appProps.pageProps.viewData.rows` de cada página de `/publicaciones?page=N` (22 páginas, 657 crudas → 270 activas con stock). Método de extracción out-of-browser: **descarga Blob** (botón inyectado + click real de la extensión = gesto de usuario; el `.crdownload` ya trae el JSON completo) → se mueve con PowerShell. (La API pública de ML da 403; clipboard API cuelga vía CDP; el output del tool trunca >~20KB.)
  - Formato item: `{n,p,l,img,usd?}`. `p`=precio venta (con promo si hay), `l`=precio lista/tachado, `usd:1`=precio en DÓLARES (11 productos). En `price.lines`: la línea `highlight:true` es el precio de LISTA; `"en promoción a $X"` es el precio de VENTA. Puntos=miles, coma=decimal.
- **Mejoras de atención (todas en vivo):**
  1. **Pago:** Max pregunta PRIMERO cómo quiere abonar y da solo los datos de ESE medio; si preguntan "¿qué medios tienen?" enumera todos (`datosPagoTexto()` reescrito).
  2. **Entrega:** tras el pago pregunta envío / retiro / colocación.
  3. **Colocación:** explica seña 50% (transferencia o MP), dura ~1h30, y pregunta "¿Desea agendar? Lo contactamos a la brevedad" → deriva a humano.
  4. **Cabina simple/doble** SOLO en camionetas (no autos). Filtro suave `cabinaDe()` + STOP_BUSQUEDA ampliado.
  5. **Opciones NUMERADAS** (1,2,3…) y pregunta qué número.
  6. **Específico por TIPO** de producto (`categoriaDe()`: alfombra/cubreasiento/cubrevolante/cubreauto) — no mezcla categorías.
  7. **Modelos cortos** (q5/x3/a3) tratados como término obligatorio (`esModeloCorto`).
  8. **Moneda USD:** `_fmtPrecio()` muestra "US$ X" para usd:1; el resto "$ X" (formato es-UY). Prompt avisa al LLM.
  9. **Fotos reforzadas:** ofrecer opciones de un modelo SIEMPRE con `enviar_foto` (no solo texto). Verificado: Audi Q5 manda 2 fotos numeradas con US$.
- **AJUSTES POSTERIORES (7 jun, noche — todos en vivo):**
  10. **SOLO lo que el cliente pide:** se quitó la regla que sumaba el cubre volante "de yapa". Si piden cubreasientos → solo cubreasientos, alfombras → solo alfombras, etc. Venta adicional únicamente si el cliente pregunta "¿qué más tienen?". (REGLA DE ORO en el prompt.)
  11. **Filtro suave sedán/hatch** (`carroceriaDe()`) + agregadas sedan/hatch/hatchback/cross a STOP_BUSQUEDA, para no quedar vacío.
  12. **Productos de a UNO con su foto:** la numeración (1,2,3) va en el PIE de cada foto (la arma el código en `responder()`, dedup por url). El texto NO repite la lista (intro breve + pregunta el número). Ver reglas en MANDAR FOTOS.
  13. **FIX selección "quiero la 1":** las opciones mostradas se guardan como CONTEXTO INTERNO en el historial (en `handler.js`, tras separador invisible `⁣`) para que el LLM sepa qué es "la 1" y AVANCE (no repita). `web.js /api/history` recorta ese contexto (el cliente no lo ve).
  14. **NO reenviar fotos / no preguntar variante después de mostrar:** si necesita una variante (sedán/hatch, cabina) la pregunta ANTES de mostrar; nunca muestra todo y después pregunta (eso causaba re-envío). Para ALFOMBRAS de auto muestra todas las opciones de una y el cliente elige por número.
  15. **Fotos de a una con ESPERA humana:** `chat.html` (tester) muestra cada foto con "escribiendo…" + 1-2s entre cada una; `whatsapp.js` hace lo mismo con presencia "composing".
  16. **Colocación SOLO en CUBREASIENTOS:** cubre volante, alfombras y demás accesorios NO se colocan (solo envío o retiro). Cubreasientos sí (seña 50%, agenda, ~1h30).
  17. **Cubre volante por MARCA sin pedir modelo exacto:** con la marca alcanza; muestra directo.
- **Backup catálogo viejo (232):** está en git history.
- Commits clave: adfb75a (catálogo 270 + USD), a11170a (refuerzo fotos), 0c9f7af (no reenviar fotos), ee375e5 (fix "la 1"), 9586046 (colocación solo cubreasientos). HEAD ~0c9f7af.
- **PENDIENTE opcional:** (1) que para CUBREASIENTOS no pregunte sedán/hatch (va directo); (2) alias/link de Mercado Pago para tarjetas (sigue sin cargar); (3) conectar WhatsApp real con chip dedicado; (4) API oficial ML para sync precios/stock automático.

## 🟢 ÚLTIMA SESIÓN (5 jun, noche) — RETOMAR ACÁ
- **Link permanente EN VIVO:** https://max-tester.onrender.com (Render, gratis, anda con la PC apagada). Para actualizarlo: `git push` + Render → "Manual Deploy → Deploy latest commit".
- **Mejoras de comunicación hechas y PUSHEADAS a GitHub (commit ed16438) pero FALTA REDESPLEGAR en Render** (el link en vivo todavía muestra la versión anterior; hay que hacer "Manual Deploy → Deploy latest commit"):
  - SIN emojis/emoticones (obligatorio en el prompt).
  - NO repreguntar lo ya respondido / no insistir; si el cliente confirma ("ese está bien"), seguir su ritmo.
  - Rioplatense en TODA la charla (no solo el saludo): "dale, bárbaro, joya, ta, mirá", voseo.
  - Saludo según hora de Uruguay (UTC-3): buenos días / buenas tardes / buenas noches (`momentoUruguay()` en cerebro.js).
  - Recomienda y OPINA ("quedan divinos", "te queda re lindo puesto"), con humor agradable, genera vínculo sutil.
  - Llama al cliente por su NOMBRE si se presenta o tras preguntar "¿con quién tengo el gusto?".
  - **Transferencia = 10% de descuento** (`NEGOCIO.descuentoTransferencia=10`). Probado: Max lo dice bien.
  - **FIX saludo (5 jun, deployado):** se presentaba 2 veces en el tester web (burbuja fija + LLM). Ahora el saludo lo genera el SERVIDOR una sola vez (`saludoInicial()` en cerebro.js, endpoint `/api/greeting` en web.js, se guarda en memoria), con "¿cómo estás?", variado y según la hora UY. El LLM no se re-presenta (lo ve en el historial). `chat.html`: sacada la burbuja fija; al abrir pide `/api/history` y si vacío `/api/greeting`. Probado en vivo OK. (commit 8f662df, ya desplegado en Render).
  - ⚠️ **Para actualizar Render**: el panel se cuelga seguido; el truco que funciona = abrir **pestaña NUEVA** en `.../deploys` y ejecutar JS que clickea "Manual Deploy" → "Deploy latest commit".
- **⏳ PENDIENTE MAÑANA — DATOS DE COBRO:** estructura lista en `config.js` → `NEGOCIO.datosCobro` (campos vacíos: `transferencia`, `mercadoPagoAlias`, `mercadoPagoLink`). El usuario los pasa mañana (no los tenía ahora). Max ya sabe usarlos: si están cargados los comparte cuando el cliente quiere pagar; si están vacíos, coordina con un humano sin inventar (lógica `datosPagoTexto()` en cerebro.js). Puede usar la MISMA cuenta de Mercado Pago de la tienda ML (solo falta el alias o el link de pago). Claude NO escribe datos financieros ni accede a la config de pagos: los pega/da el usuario.
- **Después de cargar el cobro → redesplegar en Render** (un solo deploy con todo).

## 🟢 SESIÓN 7 jun — RETOMAR ACÁ
- **Link permanente en vivo:** https://max-tester.onrender.com (Render free). Actualizar = `git push` + Render "Manual Deploy → Deploy latest commit" (truco: pestaña NUEVA en .../deploys + JS que clickea los botones; el panel se cuelga si no).
- **13 de 14 pedidos del cliente HECHOS y deployados:**
  1 dirección + ubicación Google (`NEGOCIO.ubicacionGoogle`, Max la envía) · 2 horarios L-V 9-18 · 3 ✅ **catálogo SOLO activas con stock (232 productos)** — re-scrapeado filtrando estado (Pausada/Inactiva) y stock>0 · 5 cada opción con su foto+precio (enviar_foto hasta 4, captions) · 6 medios de pago Visa/OCA/Master 6 pagos + MP + transferencia 10% · 7 cuenta Itaú Nº 5022900 a nombre de Everbox SA (`datosCobro.transferencia`) · 8 envíos a todo el país · 9 ofrece TODAS las opciones del modelo con fotos · 10 **TONO FORMAL (usted, sin jerga ni humor, sin emojis)** · 11 si no encuentra → consulta a un vendedor (derivar) · 12 pregunta instalado o envío · 13 costo de colocación no especificado → cotiza con vendedor · 14 agenda de colocación → coordina con vendedor.
- **#4 (descripciones completas de ML): RESUELTO — el cliente eligió (a)**: usar el TÍTULO completo de cada publicación (que ya es descriptivo). No requiere cambios. NOTA: la opción (b) on-demand NO es viable (ML devuelve 403 al leer item/description sin credencial de API desde el server). Si algún día quieren descripciones completas reales + sync de precios/stock, hay que conectar la API oficial de ML (crear app en developers.mercadolibre.com + OAuth) — pendiente opcional.
- **Datos de cobro:** transferencia cargada (Itaú/Everbox). Falta (opcional) alias o link de pago de Mercado Pago para tarjetas.
- **Método transferir datos scrapeados al server:** endpoint TEMPORAL `/api/_ingest` en web.js + POST desde la página de ML al túnel HTTPS lhr.life. Se AGREGA para cargar y se QUITA después (seguridad). Hoy NO está en el código.

## 🔧 FIX búsqueda (7 jun, deployado)
- Problema: Max mandaba fotos de cubreasientos de OTRO modelo (ej: para "HB20" mandaba Fiat Strada y universal). Causa: `buscarPrecio` matcheaba por palabras genéricas (cubreasiento/cuero/negro).
- Solución: `buscarPrecio` ahora ignora una lista de palabras genéricas (`STOP_BUSQUEDA`) y exige que el producto contenga las palabras DISTINTIVAS (modelo/marca, ej: "hb20", "toyota"+"hilux"). Probado en vivo: "HB20" → solo HB20 (cubreasiento + alfombras HB20). commit 9c163ef, desplegado.

## ✅ Lo que YA funciona (probado)
- **Cerebro: Claude** (`IA_PROVIDER=claude`, modelo `claude-sonnet-4-6`) vía endpoint OpenAI-compatible de Anthropic (`https://api.anthropic.com/v1/`).
  - API key **"Vale - Casa Cubreasiento"** creada en la cuenta Anthropic de **Pablo Scarlatto** (scarlattopablo@gmail.com), ~USD 15 de crédito. Está en `.env` (gitignored), **separada** de las otras keys de esa cuenta (`Buda`, `buda bot`, `bot`, `pablo`).
  - ⚠️ NO reusar la key `Buda`: esa corre el bot "Sofi" de Buda Accesorios. Cada bot, su key (control de gasto por separado).
  - Respaldo: **Groq** gratis (`GROQ_API_KEY` en `.env`, poner `IA_PROVIDER=groq`). PERO el tier gratis de Groq (100k tokens/día) es chico y lo comparte con otro bot ("Secretaria Virtual") de la misma cuenta → se agota. Por eso se eligió Claude.
- **Personalidad humana**: se presenta como Vale, pregunta primero en qué ayudar, mensajes cortos (1-2 frases), no abruma, no inventa.
- **Pausa humana**: muestra "escribiendo…" y espera antes de responder (`src/humano.js`).
- **Buffer + cola de mensajes** (`src/whatsapp.js`): si el cliente manda varios mensajes seguidos o "corta" mientras Vale escribe, junta todo (ventana 3.5s) y responde una vez considerando el último mensaje. Si llega algo nuevo mientras genera, rehace la respuesta.
- **Herramientas**: `consultar_precio` (cubreasientos desde ML), `consultar_disponibilidad`, `agendar_turno`, `tomar_pedido`, `derivar_a_humano`.
- **Precios reales de TODO el catálogo**: `src/productos_ml.json` (**611 productos**, snapshot 2026-06-04) sacados de "Mis publicaciones" de la cuenta ML del negocio (seller_id 164590340). Incluye cubreasientos, alfombras, **cubre volantes**, **cubreautos antigranizo**, llaveros, etc. Max los dice con la herramienta `consultar_precio` (busca por nombre/modelo). Cada item: `{n:nombre, p:precio venta/oferta, l:precio lista}`. (El viejo `precios_ml.json` de solo cubreasientos fue reemplazado por este.)
- **Instagram**: textos de derivación listos para pegar en la Respuesta Instantánea de IG → `INSTAGRAM_RESPUESTAS.md`.
- **Catálogo** (`src/catalogo.json`): incluye TODOS los tipos (cubreasientos a medida, GR, **cubre volantes de cuero**, **cubreautos antigranizo neopreno 6mm**, **alfombras** bandeja 3D / con logo / de baúl). Vale ya los ofrece. Solo les faltan PRECIOS (ver pendientes).
- **Cómo correr**: doble clic en `Desktop\Hablar con Vale.bat` (o `npm run sim`). WhatsApp real: `npm run whatsapp` (QR).
- **fix técnico**: `src/env.js` carga el `.env` con `override:true` (porque el entorno ya tenía una ANTHROPIC_API_KEY que tapaba la del archivo).

## ✅ RESUELTO (4 jun): precios de todos los productos
- Se entró a "Mis publicaciones" de la **cuenta ML correcta del negocio** (seller_id 164590340, distinta de la cuenta personal con 2 publicaciones de cachorros). Tenía **651 publicaciones**.
- Se bajaron las 22 páginas con `fetch` interno + parser por `#id` (el API público de ML pide auth; el HTML SSR sí trae título+precio). Resultado: **611 productos únicos** → `src/productos_ml.json`. Incluye los cubre volantes y alfombras que "faltaban".
- **Para refrescar precios a futuro:** repetir el scrape de `https://www.mercadolibre.com.uy/publicaciones?page=N&sort=DEFAULT` (logueado), parser por `#id`, regenerar `productos_ml.json`. (O automatizarlo.)

## ✅ RESUELTO (4 jun): horarios y personalidad
- **Horarios** (sacados de Google Maps): Lunes a viernes 9:00–18:00 corrido, sábado y domingo cerrado. Cargados en `NEGOCIO.horario` + `FRANJAS_TURNO` (09 a 17) en `config.js`.
- **Personalidad de Max** afinada: simpático/agradable, paciente, NO presiona para vender ni cobrar, da espacio (no insiste si el cliente no contesta). Ritmo: "piensa" y escribe con pausa variable (`humano.js`).

## ✅ RESUELTO (4 jun, parte 2): tester web + saludo variado
- **Tester web** (`npm run web` → `src/web.js` + `public/chat.html`): pantalla de chat tipo WhatsApp, mobile-friendly, mismo cerebro (canal "web"). Para compartir por LINK: túnel con `ssh -R 80:localhost:3000 nokey@localhost.run` (da `https://xxx.lhr.life`, limpio, sin interstitial). Acceso directo: `Desktop\Tester web de Max.bat` (abre server + túnel; la URL cambia cada vez salvo crear cuenta en localhost.run). ❌ localtunnel descartado (pantalla fea que pide IP). Para link FIJO/permanente: deploy a Render/Railway (pendiente, mejor para celular sin PC prendida).
- **Saludo**: ahora incluye el negocio y VARÍA cada vez (rioplatense). Truco: `OPENERS` random en `cerebro.js`.

## ✅ RESUELTO (4 jun, parte 3): Max VE fotos (visión) + fallback "lo consulto"
- **Visión (input):** el cliente manda una foto y Max la VE y la asocia con el producto/modelo. Probado: reconoció Toyota Hilux y VW Polo con sus alfombras. Implementado en `cerebro.js` (`responder(texto, prev, imagenes)` con bloques `image_url`), `handler.js` (param `imagenes`), tester web (botón 📎 en `chat.html` + `web.js` acepta `imagen` base64, json limit 15mb), y WhatsApp (`whatsapp.js` descarga la foto con `downloadMediaMessage` → data-URI; buffer ahora lleva `{textos, imagenes}`). Modelo `claude-sonnet-4-6` tiene visión.
- **Fallback:** si Max no sabe o no puede resolver algo, dice natural "lo consulto con el equipo y te confirmo 🙌" y usa `derivar_a_humano` (motivo "otro"). Nunca inventa. (Reglas en el system prompt de `cerebro.js`.)

## 🚧 EN CURSO (4 jun): nombre MAX, deploy permanente, visión, fotos-output
- **Renombre Vale → Max** ✅ (config.js ASISTENTE="Max", género masculino en prompt, acceso directo `Desktop\Hablar con Max.bat`).
- **Saludo:** una sola vez, con el negocio, VARIADO (OPENERS random) y rioplatense. Si hay historial previo, NO se re-presenta (saluda como conocido). ✅
- **Memoria:** sube a 40 mensajes; el tester web carga el historial al abrir (`/api/history`). ✅
- **Visión (Max VE fotos):** ✅ hecho y probado (web + WhatsApp). Ver parte 3 arriba.
- **✅ DEPLOY PERMANENTE (Render) — HECHO (5 jun):** Max vive en la nube en **https://max-tester.onrender.com** (link fijo, anda con la PC apagada, gratis). Cuenta Render de scarlattopablo@gmail.com (login con GitHub, email verificado). Web Service "max-tester", plan Free, repo público `scarlattopablo-star/max-tester` (branch main), build `npm install`, start `npm run start` (= node src/web.js), env vars `IA_PROVIDER=claude` + `ANTHROPIC_API_KEY` (cargada por el usuario). ⚠️ Free duerme tras 15 min idle (arranque en frío ~50s). Para actualizar el deploy: `git push` + en Render "Manual Deploy → Deploy latest commit" (auto-deploy NO está, porque se conectó como repo público). Probado: chat + clave + envío de fotos OK en la nube.
- **DEPLOY (notas históricas):**
  - Código preparado para nube: `package.json` "start" = `node src/web.js`; `web.js` usa `process.env.PORT`. ✅
  - Repo git creado y **pusheado a GitHub**: `https://github.com/scarlattopablo-star/max-tester` (usuario GitHub: scarlattopablo-star, ya logueado en su Chrome). El `.env` NO se subió (gitignored). ✅
  - Render: cuenta a nombre de scarlattopablo@gmail.com, **autorizó Render en GitHub** ✅, pero **falta verificar el email** (el mail de verificación de Render no llegaba al inbox al cierre — revisar Spam o reintentar "Resend"). Render no deja entrar al dashboard hasta verificar.
  - **PARA TERMINAR EL DEPLOY (cuando el user verifique el email y entre a Render):** New + → Web Service → conectar repo `max-tester` → Runtime Node → Build `npm install` → Start `npm start` (corre `node src/web.js`) → Plan Free → **Environment**: `IA_PROVIDER=claude` y `ANTHROPIC_API_KEY=<la del .env>` (⚠️ la API key la PEGA EL USUARIO, Claude no escribe claves en campos) → Create. Queda link fijo `https://max-tester.onrender.com` (o similar). Ojo: Free duerme tras 15 min (arranque en frío ~1 min) y el filesystem es efímero (la memoria de charlas se resetea en cada redeploy — ok para tester).
- **Link temporal mientras tanto:** túnel localhost.run (`Desktop\Tester web de Max.bat` o el ssh `-R 80:localhost:3000 nokey@localhost.run`). Inestable (se corta). La última URL viva fue `https://e58478d92a62d4.lhr.life` (cambia en cada relanzado).
- **FOTOS que Max ENVÍA (output) — ✅ HECHO (5 jun):** `src/productos_ml.json` ahora tiene `img` (URL foto mlstatic) en los 611 productos. Tool `enviar_foto` (busca por producto/modelo, devuelve hasta 2 fotos). `responder()` devuelve `imagenesEnviar` → handler → canales: tester web las renderiza (`chat.html` `addImage`), WhatsApp las manda como imagen (`sendMessage {image:{url}}`). Las URLs se agrandan de `-I.jpg` (miniatura 4KB) a `-O.jpg` (grande ~48KB) en `buscarPrecio`. Probado OK.
  - **Cómo se transfirió la data del navegador al archivo (truco que funcionó):** endpoint temporal `POST /api/_ingest` en `web.js` (con CORS `*` + header PNA), y desde la página de ML (`mercadolibre.com.uy`, que tiene la data en `localStorage['maxclean2']`) se hizo `fetch` al **túnel HTTPS** (`https://xxx.lhr.life/api/_ingest`, público→público, sin bloqueo PNA). El POST a localhost directo se bloquea por Private Network Access; el download de Chrome se bloquea tras la 1ª descarga. Para refrescar fotos a futuro: re-scrapear con `img` y repetir este ingest por el túnel.

## ⏳ PENDIENTES (retomar por acá)
1. **Chip/número dedicado de WhatsApp** (NO el 091 629 784) para escanear el QR y salir al aire.
2. **Max ENVÍA fotos del producto (output)** — DISTINTO de lo de arriba (eso es que Max VE; esto es que MANDE). Falta: re-scrapear ML capturando la URL de la foto principal de cada publicación (hoy `productos_ml.json` solo tiene n/p/l), tool `enviar_foto` + envío de imagen en WhatsApp (`sendMessage {image}`) y en el tester web. Fuente: fotos reales de ML vs diseños de Instagram.
3. **Link permanente** (deploy en Render/Railway) si quieren un link fijo para el celular sin depender de la PC.
2. (Opcional) Automatizar la actualización de precios leyendo la tienda de ML cada tanto (hoy es snapshot manual).
3. (Opcional) Pegar en Instagram la Respuesta Instantánea (texto en `INSTAGRAM_RESPUESTAS.md`).
4. (Opcional) Hosting 24/7 con PM2 en un VPS (pasos en `README.md`).

## Archivos clave
- `src/cerebro.js` — IA + system prompt + herramientas
- `src/config.js` — datos del negocio + nombre Max + horarios + proveedores IA
- `src/catalogo.json` — productos (tipos/descripciones) · `src/productos_ml.json` — 611 productos con precio (ML)
- `src/whatsapp.js` — Baileys + buffer/cola · `src/simulador.js` — prueba en terminal
- `.env` — IA_PROVIDER=claude + claves (NO subir a git)
