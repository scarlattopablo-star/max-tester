# Lo que Max le dice al cliente: la nota interna y el precio inventado

**5 de agosto de 2026**, mismo día que los arreglos de búsqueda (ver
`2026-08-05-busqueda-que-decia-agotado.md`). Con el stock ya respondiendo bien, aparecieron dos
cosas distintas, las dos reportadas por Pablo con capturas de pantalla, y las dos de la **misma
familia**: el modelo produciendo texto que no le corresponde producir.

---

## 1. Le mandó al cliente su propia nota interna

**Lo que vio el cliente** (14:21, después de preguntar *"tenes para hb20"*):

> Buenas noticias también para tu HB20, ya volvió a tener stock. Te muestro la opción
> disponible.**[Contexto interno — opciones que le mostré al cliente con foto, numeradas: 1)
> Alfombra Hb20 Bandeja Rigida Negro - $ 2.850. Si el cliente elige un número ("la 1", "el 2",
> "quiero la primera"), corresponde a ESTA lista; NO vuelvas a mostrar las opciones: avanzá con la
> que eligió.]**

Ese bloque es una nota que el **código** (`handler.js`) le deja a Max en el historial, después de un
separador invisible, para que en el turno siguiente sepa a qué producto se refiere "la 1".

### Por qué se escapó — que es lo único que hay que recordar

El reflejo es ir a mirar el envío. **No estaba ahí:** los tres canales (`whatsapp.js`,
`whatsapp_meta.js`, `web.js`) ya mandaban `texto: respuesta`, el texto limpio. Se verificaron los
tres.

Lo que pasó es que la nota **vive en el historial que Max LEE**. Vio el bloque en turnos anteriores,
lo tomó por parte del formato de sus propias respuestas, y **lo escribió él**. No se filtró por el
envío: lo redactó el modelo.

### Dónde se cortó

En `limpiarJerga()` de `cerebro.js`, que es lo último que toca lo que Max escribe antes de salir.
Corta por `[contexto` (agarra el "Contexto interno" y también el bloque del anuncio de IG/FB, que
entra por el turno del cliente y es igual de largo), la marca de *"respuesta escrita por un ASESOR
humano"* y el separador invisible.

- ⚠️ **NO borra cualquier corchete.** Los marcadores reales de la charla (`[comprobante #304]`)
  tienen que sobrevivir, y hay un caso de prueba que lo cuida.
- **Lo que se GUARDA no cambia:** la nota sigue llegando entera a la memoria (el handler la agrega
  después) y `esMsgAsesor` sigue distinguiendo quién escribió. `limpiarJerga` solo toca la salida.

Prueba: `node test_no_filtrar_contexto_interno.mjs`.

---

## 2. Inventó un precio, y después lo repitió como confirmado

**Lo que vio el cliente** (16:00 y 16:01):

> ¡Hola de nuevo! Sí, la alfombra bandeja rígida para tu HB20 está disponible, **sale $2.850**.
> […] Sí, **tal como te comenté recién**, tenemos la alfombra bandeja rígida negra para tu HB20 a
> $2.850. ¿Querés que avancemos con la compra?

**La bandeja del HB20 sale $3.360.** Y $2.850 no es el precio de **ninguna** publicación, ni activa
ni pausada. Inventó también el nombre: dijo "Alfombra Hb20 Bandeja **Rigida** Negro" y la real se
llama "Alfombra Hb20 Bandeja **3d** Negro".

Mirando la conversación en producción: en ninguno de los dos mensajes salió una foto, o sea que **no
buscó nada** — contestó de memoria e inventó los datos, copiando incluso el formato del caption
(`N) nombre - $ precio`).

`filtrarInventos` solo miraba promesas de fabricar o colocar. **Los precios no los controlaba
nadie.**

### La decisión que importa: contra qué se valida

Controlar contra **todo el catálogo no sirve**, y se midió *antes* de escribir el control:

```
precios reales distintos en el catálogo: 194
universo "explicable" (real + 10% off):  620
¿2850 es explicable?  🚨 SÍ  → el control no lo agarraría
de los 9.000 números de 4 cifras, cuántos pasarían: 432 (4,8%)
```

$2.850 entra por casualidad como el 10% de descuento de otro producto. Por eso el control es contra
los precios que la herramienta devolvió **en ese turno**, que son un puñado de números.

### Qué se acepta igual, para no romper lo que ya andaba

- **El 10% de la transferencia** (redondeado como sea): el prompt le PIDE decir el monto ya
  descontado (líneas "REGLA DE ORO" del prompt).
- **Las sumas**, para cuando el cliente se lleva más de un producto.
- **Los precios que ya estaban en la charla**, pero ⚠️ **solo si son un precio REAL del catálogo,
  tal cual**. La primera versión los aceptaba todos y se auto-engañaba: ver el apéndice al final,
  es el error que hizo que Max siguiera repitiendo el $2.850.

### Qué hace cuando lo agarra

Se cae **solo la frase** del precio, no el mensaje entero, se le dice al cliente que lo confirma, y
**se deriva a una persona** con el número que Max estuvo por decir, para que pase el precio correcto.

⚠️ **Al tocar esto:** el punto de "$2.850" **no es un fin de frase**. Sin taparlo antes de cortar
queda un `"850."` suelto, que al cliente le resulta más raro todavía que el precio equivocado.

Prueba: `node test_precios_reales.mjs`.

### Verificado con la IA real, no solo con datos simulados

El riesgo del control es el opuesto al bug: que silencie precios **buenos**. Se probó con el modelo
en vivo:

| Consulta | Max contestó | Captions de las fotos |
|---|---|---|
| "tenes alfombra bandeja para hilux? cuanto sale" | $3.352 y $3.636 | $ 3.352 / $ 3.636 / $ 13.500 |
| "hola, tenes alfombra para hb20?" | (sin precio en el texto) | $ 3.360 / $ 1.739 / $ 2.672 / $ 5.900 |

Los precios legítimos salen intactos y coinciden exactamente con los captions.

---

## La regla de fondo

Las dos cosas son la misma familia, y ya había precedente en este proyecto (el filtro de jerga, el
guard de derivación, el filtro de variantes):

> **Cualquier cosa que se meta en el historial "para el modelo" puede terminar copiada y enviada al
> cliente. Y cualquier dato que el modelo pueda escribir de memoria, lo va a inventar alguna vez.**
> Cuando algo se le escapa al modelo, se pasa a código, en la salida.

Si se agrega otro marcador interno o algún otro dato duro (plazos, medidas, garantías), sumarlo al
filtro **y** al test.

---

## Apéndice: dos errores míos que salieron al verificar en vivo

Pablo avisó que **seguía dando mal el precio** con el control ya puesto. Tenía razón, y aparecieron
dos cosas distintas.

### 1. El control se auto-engañaba: un invento anterior se heredaba

La primera versión aceptaba cualquier precio que **ya estuviera en la charla**, con el argumento de
que "pasó por este mismo control cuando se dijo". Eso es falso para las conversaciones que **ya
tenían un invento escrito de antes**: el `$2.850` del HB20 quedó en el historial y el propio control
lo daba por bueno, así que Max lo seguía repitiendo (*"tal como te comenté recién"*). Reproducido:

```
filtrarPrecios("...a $2.850.", [], charla_que_ya_tenia_2850)
  → inventado: null   🚨 lo dejaba pasar
```

**Corregido con la asimetría correcta:**

| De dónde viene el precio | Qué se acepta |
|---|---|
| La herramienta, **en ese turno** | el número, su 10% de descuento y las sumas — salió del catálogo hace un segundo |
| **La charla** (lo que Max dijo antes) | **solo si es un precio REAL del catálogo, tal cual** — su propio texto no es fuente de verdad |

### 2. No había forma honesta de saber qué código estaba corriendo

Se estaba usando `ultimaSync` de `/api/estado` como señal de deploy. **Esa hora cambia sola cada 30
minutos** con la sincronización de Mercado Libre: daba por desplegado un build que podía seguir
viejo. Verificar mirando la señal equivocada es peor que no verificar, porque se reporta como hecho
algo que no está.

- **`/api/estado` ahora publica `build.commit`** (el `RENDER_GIT_COMMIT`, se compara con el
  `git log -1` local) **y `build.arranque`** (desde cuándo vive el proceso). Si `arranque` no cambió
  después de un push, el deploy no subió.
- **El hook `pre-push` podía no disparar nada.** Corría el curl del Deploy Hook en segundo plano
  (`( sleep 6; curl ) &`) y ese subproceso podía morir al terminar el push, mientras el hook igual
  imprimía "deploy programado". Ahora corre en **primer plano** y avisa con el código HTTP si no
  salió. ⚠️ Vive en `.git/hooks/pre-push` y **no está versionado**: al clonar el repo hay que
  rehacerlo.
- **Para probar el Max de producción sin escribirle a nadie**, `POST /api/chat` (sin auth) con un
  `chatId` descartable devuelve el texto y los captions con sus precios:

```bash
curl -s -X POST https://max-tester.onrender.com/api/chat -H "Content-Type: application/json" \
  -d '{"chatId":"prueba","texto":"tenes alfombra para hb20? cuanto sale"}'
```
