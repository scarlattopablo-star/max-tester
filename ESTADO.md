# ESTADO del Agente IA "Max" — RETOMAR ACÁ

Bot de WhatsApp (Baileys, sin API de Meta) + derivación de Instagram, para La Casa del Cubreasiento.
Asistente se llama **Max** (antes Vale; renombrado 4 jun). Carpeta: `agente_ia/`.

## 🟢🟢 SESIÓN 12 jun — SYNC ML EN VIVO RESUELTO (lo más nuevo)
- **✅ API PÚBLICA DEL CATÁLOGO PARA LA WEB:** `GET /api/catalogo` en max-tester (CORS abierto, caché 5 min). Devuelve `{moneda, actualizado, fuente, cantidad, productos:[{n,p,l,img,usd?,u}]}` — `u` = permalink a la publicación de ML (para el botón comprar). **Verificada en vivo** (270 productos, fuente api-ml). La consume el sitio lacasadelcubreasiento.com.uy.
- **🌐 SITIO WEB (Vercel):** proyecto Vercel `lacasadelcubreasiento` (cuenta scarlattopablo-star, dominio lacasadelcubreasiento.com.uy). El deploy se hacía con `vercel deploy` desde la carpeta local `C:\Users\acer\Desktop\Claude\CLIENTES\CUBREASIENTO\la casa del cubre asiento` (SIN git conectado). **12 jun: el código se subió a GitHub → `scarlattopablo-star/lacasadelcubreasiento` (privado, rama main).** PENDIENTE: (a) conectar el proyecto Vercel a ese repo (botón "Connect Git" en el panel) para auto-deploy en cada push; (b) integrar el catálogo en vivo en el sitio leyendo /api/catalogo — se hace en una sesión de Claude Code sobre ESE repo (esta sesión solo ve max-tester). ⚠️ La sesión nueva debe revisar si hay `.env` trackeado en ese repo (era un git preexistente) y sacarlo con `git rm --cached`.
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
