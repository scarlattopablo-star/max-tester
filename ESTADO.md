# ESTADO del Agente IA "Vale" — RETOMAR ACÁ

Bot de WhatsApp (Baileys, sin API de Meta) + derivación de Instagram, para La Casa del Cubreasiento.
Asistente se llama **Max** (antes Vale; renombrado 4 jun). Carpeta: `agente_ia/`.

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
