# Orquesta IA — Brief comercial (plantilla reutilizable)

> Documento de venta del asistente IA de atención al cliente. Preparado para la reunión con
> **Outlet Market** (30 jul 2026) pero escrito para reusarse con cualquier prospecto.
> Los datos técnicos salen del código real de este repo (Max) y de la operación de Sofi y Juli.

---

## 0. El cliente: Outlet Market

**outletmarket.uy · @outletmarket.uy · Montevideo.** Vende **electrodomésticos nuevos con
detalles estéticos mínimos** a precio de outlet. Rubros: cocina (hornos, microondas,
lavavajillas), refrigeración (heladeras, freezers), lavado y secado, pequeños electrodomésticos,
tecnología, y algo de construcción/herramientas.

**A favor:**

- **El catálogo ya existe y es consultable.** Tienda online con fichas y precios visibles; por
  la estructura de las URLs (`/product-category/`) es casi seguro **WooCommerce**, que tiene API.
  El escenario fácil de la pregunta más pesada del descubrimiento.
- **Ya mandan las fotos a mano por WhatsApp** (lo dicen en su propia web). Es exactamente lo que
  hace `enviar_foto`. Mejor entrada posible a la conversación.
- **Venden combos** ("Combo Cocina" = heladera + lavavajillas; "Combo Mudanza" = heladera +
  cocina + microondas + lavarropas). Detectar la intención de mudanza y ofrecer el combo sube el
  ticket, y es configuración, no desarrollo.
- **Ticket alto.** Recuperar dos ventas por mes paga el abono varias veces.

**⚠️ El detalle técnico a levantar en la reunión:** un outlet de electrodomésticos suele tener
**unidades únicas** (esta heladera con un golpe en la puerta, aquella con un rayón), no un SKU
con veinte iguales. El asistente no puede prometer "tengo tres" si hay una sola con un defecto
puntual. Hay que definir **cómo se describe el estado de cada unidad y si el stock es por unidad
o por modelo**. Traer esta pregunta demuestra que entendiste su negocio.

---

## 1. Pitch (30 segundos)

No es un chatbot de botones. Es un vendedor que trabaja 24/7 en el WhatsApp del negocio:
entiende texto libre, cotiza con precios reales del catálogo, manda fotos y videos del
producto, toma el pedido, genera el link de pago, agenda y deriva a una persona cuando hace falta.

**Prueba:** tres asistentes en producción — Max (La Casa del Cubreasiento), Sofi (Buda
Accesorios) y Juli. Mismo motor, reglas y personalidad distintas por negocio.

**Demo:** https://max-tester.onrender.com — abrirla 10 min antes (Render free duerme, arranque
en frío ~50 s).

---

## 2. Preguntas de descubrimiento (sin esto no se cotiza)

| Pregunta | Por qué importa |
|---|---|
| ¿Cuántas consultas por WhatsApp por día? | Define el costo mensual de IA (es el único variable). |
| ¿Qué número, y está en WhatsApp Business app? | Coexistence conserva chats e importa 6 meses de historial. |
| ¿Dónde viven precios y stock? ¿Cuántos productos? | Con API se sincroniza solo; si no, hay trabajo previo de datos. |
| ¿El asistente cobra o deriva? | Cobrar requiere token de producción de Mercado Pago = otro alcance. |
| ¿Quién atiende y desde dónde toma el control? | Celular / Meta Business Suite / panel propio. Ya hizo fracasar una migración. |
| ¿Hacen anuncios Click-to-WhatsApp? | Si sí, la API oficial deja de ser opcional. |
| ¿Quién es admin de Meta Business? ¿Negocio verificado? | La verificación tarda horas a 3 días y la hace el dueño. Cuello de botella #1. |
| ¿Instagram también? | Se puede con la misma app de Meta, pero es alcance aparte. |
| Reglas: horarios, envíos, garantías, pagos, qué cotiza un humano | Es el 80 % del trabajo de implementación. |

---

## 3. Stack (5 capas)

| Capa | Qué hace | Tecnología |
|---|---|---|
| 1. Canal | Entrada/salida de mensajes | WhatsApp Cloud API (Meta) directo o vía BSP 360dialog + Coexistence; webhook |
| 2. Servidor | Recibe, agrupa mensajes seguidos, "escribiendo…", envía | Node.js + Express, 24/7 en Railway o Render |
| 3. Cerebro | Decide qué contestar y qué herramienta ejecutar | Claude `claude-sonnet-5` + tools + caché de prompt; visión (lee fotos del cliente) |
| 4. Memoria | Historial, pedidos, transferencias, métricas, aprendizaje diario | Postgres (Neon) |
| 5. Integraciones | Catálogo, cobros, avisos, panel | API Mercado Libre (sync cada 6 h), Mercado Pago Checkout Pro, plantillas Meta, panel `/equipo` |

**Herramientas implementadas hoy (13):** `consultar_precio`, `enviar_foto`, `link_web`,
`solicitar_turno`, `tomar_pedido`, `crear_link_pago`, `confirmar_transferencia`,
`descripcion_oficial`, `mostrar_capitoneado`, `mostrar_ecocuero`, `mostrar_tela`,
`mostrar_cuero_sport`, `derivar_a_humano`.

Las cuatro `mostrar_*` son del rubro cubreasientos; para otro cliente se reemplazan por las de
su catálogo. Mismo motor, otras herramientas.

**Recorrido de un mensaje:** cliente → Cloud API → webhook → servidor (agrupa + presencia) →
cerebro (reglas + historial) → ¿tool? (catálogo / link de pago / derivación) → respuesta con
fotos y videos → API → cliente. En paralelo, todo se persiste en la base.

Dos garantías que generan confianza:
- Si no sabe, **no inventa**: avisa que consulta y dispara `derivar_a_humano`. El chat queda
  resaltado **sin leer** en la bandeja y el equipo recibe un aviso por plantilla.
- Si un humano contesta a mano, el asistente **se calla** en esa conversación (handoff).

---

## 4. Puesta en marcha (secuencia real)

1. Elegir número y pasarlo a WhatsApp Business (gratis, conserva chats).
2. Verificar el negocio en Meta Business — horas a 3 días, lo hace el admin.
3. Alta del número en la API + QR → Phone Number ID, token permanente, verify token del
   webhook. Van como variables de entorno, **nunca al código**.
4. Conectar el catálogo (credenciales de API o export de precios/stock).
5. Cargar datos de cobro si corresponde (los pega el cliente, nunca nosotros).
6. Escribir las reglas del negocio — la sesión de trabajo más importante del proyecto.
7. Definir número de avisos, **distinto del bot** (la API no se escribe a sí misma) + plantilla
   utilitaria aprobada para que el aviso llegue siempre.
8. Probar con el equipo presente y salir al aire (el corte con Coexistence son minutos).

⚠️ Los pasos 2 y 7 dependen de aprobación de Meta. Comprometer **2–4 semanas desde los
accesos**, nunca una fecha fija en la reunión.

---

## 5. Costos de operación (a terceros)

**Clave contraintuitiva, con fecha de vencimiento:** desde julio 2025 Meta cobra **por mensaje**,
y hoy todo lo enviado dentro de la ventana de 24 h posterior al mensaje del cliente es **gratis**.

⚠️ **Desde el 1.º de octubre de 2026 eso se termina.** Meta vuelve a cobrar los **mensajes de
servicio** (las respuestas libres dentro de la ventana de 24 h) a la misma tarifa que los
utilitarios. La ventana de 24 h sigue existiendo; lo que desaparece es que sea gratis. Es un
argumento para cerrar ahora y no en noviembre.

| Componente | Mensual | Detalle |
|---|---|---|
| Cerebro IA (Claude API) | US$ 25 – 90 | Escala con volumen |
| Servidor 24/7 | US$ 5 – 20 | Railway (el free de Render se duerme y corta la conexión) |
| Base de datos | US$ 0 – 19 | Neon; el free alcanza para arrancar |
| BSP WhatsApp (360dialog) | ≈ US$ 55 | €49/número, sin recargo sobre Meta. **Evitable**: directo a Meta = US$ 0 |
| Mensajes de respuesta — hasta 30 set 2026 | US$ 0 | Ventana de servicio 24 h |
| Mensajes de respuesta — desde 1.º oct 2026 | US$ 10 – 60 | ≈ US$ 0,01 por mensaje a tarifa de utilitario; 6–10 ¢ por conversación. Baja por volumen. |
| Plantillas iniciadas | ≈ US$ 0,01 – 0,08 c/u | Utility baratas, marketing bastante más caro |
| **Total** | **US$ 85 – 185**<br/>**US$ 95 – 245** desde oct | Directo a Meta: **US$ 30 – 130** (US$ 40 – 190 desde oct) |

Los valores por mensaje son orden de magnitud para "resto de Latinoamérica" (donde cae Uruguay);
Meta ajusta por país y da descuentos por volumen en utilitarios y servicio, no en marketing.
La página oficial de tarifas de Meta devuelve 403 desde el entorno, así que **la fila exacta de
Uruguay queda por confirmar** — no ponerla por escrito en una propuesta sin chequearla.

### Desglose del costo de IA

Claude Sonnet 5: US$ 3 /M tokens de entrada, US$ 15 /M de salida. La parte fija del prompt
(reglas + catálogo) va en **caché**, que la abarata 10× (US$ 0,30 /M en lectura de caché).

- ≈ **US$ 0,02–0,03 por mensaje respondido**
- ≈ **US$ 0,35 por conversación** de venta completa (~15 mensajes)

| Volumen | Sonnet 5 | Haiku 4.5 |
|---|---|---|
| 100 conversaciones/mes | ≈ US$ 35 | ≈ US$ 12 |
| 300 conversaciones/mes | ≈ US$ 105 | ≈ US$ 36 |
| 600 conversaciones/mes | ≈ US$ 210 | ≈ US$ 70 |

**Palanca:** Haiku 4.5 (US$ 1 / US$ 5) cuesta un tercio de Sonnet 5. Se arranca en Sonnet por
calidad y se baja a Haiku si el volumen se dispara — es un cambio de una línea en `config.js`
(preset `claude` → `IA_MODEL`), sin tocar nada más.

---

## 6. Precio de venta (referencia, decisión comercial del dueño)

| Concepto | Rango | Incluye |
|---|---|---|
| Implementación (único) | US$ 900 – 1.500 | Alta en Meta, catálogo, reglas del negocio, herramientas del rubro, pruebas, capacitación. 2–4 semanas. |
| Abono mensual (con tope de conversaciones) | US$ 350 – 500 | Infra + IA + monitoreo + soporte + ajustes de reglas |
| Excedente | US$ 0,50 – 1 | Por conversación arriba del tope, o salto de banda |
| Piloto (si dudan) | US$ 250 / mes | Alcance recortado: atiende, asesora y cotiza; no cobra. Sin implementación. |

Con abono US$ 400 e infra US$ 120 → margen ≈ **US$ 280/mes por cliente**. El abono es lo que
sostiene el negocio; la implementación apenas paga el trabajo inicial.

**Anclajes para la conversación:**
- Wati ≈ US$ 49/mes y Respond.io ≈ US$ 79/mes son **solo una bandeja compartida** — sin IA, sin
  catálogo, sin cotizar, sin cobrar, y varios suman recargo por mensaje.
- El anclaje que cierra: **medio sueldo** de una persona atendiendo WhatsApp, que además no
  trabaja de noche ni los domingos.

---

## 7. Límites (decirlos en la reunión, no esconderlos)

- **La IA se equivoca.** Por eso existen derivación, avisos y panel de control. El diseño asume
  el error.
- **La vía gratis (Baileys, WhatsApp Web no oficial) tiene precio escondido:** riesgo de baneo
  del número + limitación conocida (issue #1723) que retiene el primer mensaje de leads de
  anuncios hasta que alguien responde a mano. Si hacen ads, la API oficial no es opcional.
- **Fuera de las 24 h no se escribe libre.** Sin plantilla aprobada, Meta acepta el envío y lo
  descarta en silencio (status `failed`, código 131047).
- **Sin catálogo consultable no hay cotización.** Ordenar datos se cotiza aparte.
- **El equipo tiene que querer usarlo.** Caso real: se revirtió una migración entera porque a
  los asesores no les gustó el panel y volvieron al celular. Preguntar desde el día uno dónde
  quieren atender.
- **Instagram es otro alcance.** No meterlo en el mismo precio.

---

## 8. Objeciones y respuestas

**"Es caro."** Comparar contra medio sueldo de alguien atendiendo y contra las ventas perdidas
de noche y los domingos. Preguntar el ticket promedio: si recupera dos ventas por mes, se pagó.

**"El cliente se va a dar cuenta."** Habla rioplatense, saluda según la hora real, se toma su
tiempo, manda fotos reales, llama al cliente por su nombre, y cuando no sabe deriva. Abrir la
demo y que escriban ellos.

**"¿Le saca el trabajo al equipo?"** Filtra y prepara: hace las cien preguntas repetidas de
precio, medida y disponibilidad, y entrega la conversación caliente con los datos. Los chats
derivados quedan resaltados sin leer.

**"Ya tenemos un chatbot."** Tres preguntas: ¿entiende texto libre o son botones? ¿Dice el
precio real de un producto puntual? ¿Toma un pedido y genera link de pago? Si es no, tienen un
menú.

**"Meta saca su propio asistente con IA, ¿no lo vamos a tener gratis?"** Existe, y desde agosto
2026 Meta lo cobra por consumo (unos centavos por conversación). Pero es genérico: no conoce su
catálogo, no sabe qué unidad tiene qué golpe, no arma un combo mudanza, no genera el link de
pago, no avisa al vendedor ni deja el chat sin leer. Es la diferencia entre contestar y *vender*.
Si aparece algo de Meta que convenga, se integra: la capa del canal es reemplazable.

**"¿Dónde quedan nuestros datos?"** Las conversaciones en la base del proyecto; las credenciales
de WhatsApp, catálogo y cobros son del cliente — las carga él y las revoca cuando quiera. El
número también es suyo y sigue en su celular.

---

## 9. Con qué salir de la reunión (en orden de preferencia)

1. **Fecha de demo con su catálogo cargado.** El cierre más potente: verlo cotizando *sus*
   productos convierte más que cualquier presentación. Solo hace falta el export de precios.
2. **Alcance del piloto definido** (atención+cotización vs. venta completa) + accesos de los
   puntos 1 y 4 del checklist.
3. **Nombre del admin de Meta Business** y que arranquen la verificación esta semana — es lo
   único que no se puede acelerar después.

**Anotar durante la reunión:** consultas por día · dónde viven los precios · quién atiende y
desde dónde · si hacen anuncios a WhatsApp. Con esos cuatro datos se cotiza firme el mismo día.
