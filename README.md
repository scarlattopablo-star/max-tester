# Agente IA "Vale" — La Casa del Cubreasiento

**Vale** es una asistente con IA que **atiende, asesora, vende y agenda turnos** por WhatsApp
(vía [Baileys](https://baileys.wiki), **sin API de Meta**) y que **deriva educadamente a WhatsApp**
cuando alguien escribe por Instagram. Mismo concepto que "Sofi" de Buda Accesorios.

El "cerebro" es una IA configurable (Gemini gratis, Groq gratis, OpenAI o Claude). Hay **un
simulador** para probar todo en la terminal **antes** de conectar el WhatsApp real.

```
Simulador (terminal)  ─┐
WhatsApp (Baileys/QR) ─┼──► handler.js (un solo cerebro) ──► IA + catálogo + agenda + pedidos + derivación
Instagram (derivar)   ─┘
```

---

## 1. Instalación (una sola vez)

```powershell
cd "C:\Users\acer\Desktop\Claude\la casa del cubre asiento\agente_ia"
npm install
copy .env.example .env
```

Después abrí `.env` y elegí el cerebro + pegá su clave (ver tabla):

| Proveedor | `IA_PROVIDER` | Clave en `.env` | Costo | Dónde se saca |
|-----------|---------------|-----------------|-------|---------------|
| Google Gemini | `gemini` | `GEMINI_API_KEY` | **Gratis** (solo Gmail) | https://aistudio.google.com/apikey |
| Groq (Llama) | `groq` | `GROQ_API_KEY` | **Gratis** (registro email) | https://console.groq.com/keys |
| OpenAI (GPT) | `openai` | `OPENAI_API_KEY` | Pago | https://platform.openai.com/api-keys |
| Claude (Anthropic) | `claude` | `ANTHROPIC_API_KEY` | Pago | https://console.anthropic.com |

> El simulador anda **sin clave** para probar el flujo de Instagram, la agenda y los pedidos;
> para que Vale responda con IA (WhatsApp) sí necesitás cargar una clave.

---

## 2. Probar en el simulador (hacelo SIEMPRE antes de activar)

```powershell
npm run sim
```

Escribís como si fueras un cliente. Comandos:

| Comando | Qué hace |
|---------|----------|
| `/wa` | Canal WhatsApp (Vale completa: asesora, vende, agenda) |
| `/ig` | Canal Instagram (deriva a WhatsApp, instantáneo) |
| `/agenda` | Turnos que Vale agendó |
| `/pedidos` | Pedidos que Vale tomó (para cerrar cobro) |
| `/derivaciones` | Conversaciones que Vale pasó a un humano |
| `/reset` | Borra la charla y empieza de cero |
| `/salir` | Cierra el simulador |

Cuando Vale agenda, toma un pedido o deriva, vas a ver la acción (`⚙ acción: agendar_turno → OK`).
Todo queda en `data/*.json`.

---

## 3. Activar WhatsApp real (recién cuando lo probaste)

> ⚠️ **Usá un chip / número DEDICADO para el bot. NUNCA el 091 629 784 principal.**
> Baileys es WhatsApp Web no oficial y hay riesgo de baneo del número conectado.

```powershell
npm run whatsapp
```

Aparece un **QR en la terminal**. En el celular del bot:
**WhatsApp → Dispositivos vinculados → Vincular un dispositivo** → escaneás el QR.
Listo, Vale empieza a contestar.

- La sesión queda en `auth_baileys/` (no re-escaneás cada vez).
- Para reiniciar de cero: cerrá el proceso y borrá `auth_baileys/`.
- Ignora grupos y estados; solo responde chats directos.

---

## 4. Instagram (derivar a WhatsApp)

Instagram **no** se automatiza con Baileys (es solo WhatsApp) y vos no querés API de Meta. Camino
recomendado, **gratis y sin riesgo**: poné el texto que genera el proyecto como **Respuesta
instantánea** de Instagram (app de IG cuenta de empresa → *Configuración → Herramientas para
empresas → Respuestas guardadas / Mensaje de bienvenida*). El texto lo ves en el simulador con `/ig`.

---

## 5. Dejarlo prendido 24/7

Vale tiene que estar **corriendo** para contestar. Opciones:

**A) En tu PC (lo más simple para arrancar):** dejá abierta la ventana con `npm run whatsapp`.
Si cerrás la PC, Vale se apaga. Sirve para probar con clientes reales unos días.

**B) 24/7 de verdad (recomendado): un servidor barato + PM2.**
PM2 mantiene el bot prendido y lo reinicia solo si se cae o si se reinicia el server.

```powershell
npm install -g pm2
pm2 start src/whatsapp.js --name vale-bot
pm2 logs vale-bot      # ver lo que pasa
pm2 save               # recordar el proceso
pm2 startup            # que arranque solo al prender el server (seguí lo que imprime)
```

- **Dónde hostear:** un VPS chico (Hostinger, DigitalOcean, Contabo, Railway, Render…) con
  Node 18+. Con 1 GB de RAM sobra. Ahí subís la carpeta `agente_ia/`, hacés `npm install` y los
  pasos de PM2 de arriba.
- **El QR:** la primera vez tenés que escanearlo desde el server (corré `pm2 logs vale-bot` para
  verlo). Después la sesión queda guardada en `auth_baileys/` y no hace falta más.
- **Importante:** subí el `.env` con la clave, pero **nunca** subas `auth_baileys/` ni `.env` a un
  repositorio público.

---

## 6. ✅ Qué tenés que conseguir vos

1. **Clave de la IA** (el cerebro). Elegí una de la tabla del punto 1 — recomiendo **Gemini o Groq
   (gratis)**. La pegás en `.env`.
2. **Chip / número de WhatsApp DEDICADO** para el bot (uno nuevo, NO el 091 629 784). Un chip
   prepago alcanza. Es el que vas a escanear con el QR.
3. **(Opcional) Hosting 24/7:** un VPS barato si querés que Vale atienda siempre, aunque apagues
   tu PC (ver punto 5).
4. **Mantener el catálogo al día** en `src/catalogo.json` (precios, stock, productos de Mercado
   Libre con su link). Vale se nutre de ahí.

Yo ya dejé hecho: el código, la conexión Baileys, el system prompt de Vale, la lógica de
conversación con historial, la agenda, los pedidos, la derivación a humano y el simulador.

---

## Estructura

```
agente_ia/
├─ src/
│  ├─ simulador.js     ← probar en la terminal (npm run sim)
│  ├─ whatsapp.js      ← conexión Baileys + QR + sesión (npm run whatsapp)
│  ├─ handler.js       ← une los canales con el cerebro
│  ├─ cerebro.js       ← IA (Vale) + herramientas (agendar / pedido / derivar)
│  ├─ instagram.js     ← mensaje de derivación a WhatsApp
│  ├─ agenda.js        ← turnos en el local
│  ├─ pedidos.js       ← pedidos para cerrar cobro
│  ├─ derivaciones.js  ← casos que pasan a un humano
│  ├─ memoria.js       ← memoria por conversación
│  ├─ catalogo.json    ← productos (editá precios acá)
│  └─ config.js        ← datos del negocio + nombre del asistente
├─ data/               ← se crea solo (agenda, pedidos, derivaciones, conversaciones)
└─ test_smoke.mjs      ← test rápido (node test_smoke.mjs)
```
