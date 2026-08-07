# El color no dice qué línea: Max cobró $3.279 de menos

**7 de agosto de 2026.** Pablo lo reportó así: *"max pasa precio de ecocuero comun liso sin
capitonear, cuando el cliente eligió capitoneado color ocre. anteriormente él dio el precio correcto
del capitoneado en esa conversación. el cliente reenvió la foto a max para decirle cuál elegía."*

Es el primer error de precio de este proyecto que **le costó plata a la casa de verdad**: la venta se
cerró, se emitió el link de Mercado Pago y el cliente pagó.

---

## Qué pasó

Chat `59898785444` (Vanessa Leites, 098 785 444), Fiat Strada **Freedom**.

| # | Quién | Qué |
|---|---|---|
| 11 | Max | Muestra el **capitoneado** con su precio **correcto**: **$9.765** |
| 12 | Cliente | *"Ahhh requiere colocacion. Ta me es imposible. Estoy en el interior."* |
| 13 | Max | Le ofrece el **eco cuero** (solo venta, sin colocación) |
| 15 | Max | *"¿Cuál de las tres costuras te gusta más: ocre, azul o blanca?"* |
| 16 | Cliente | *"Este me gusta"* — **señalando la foto del capitoneado** |
| 18 | Cliente | *"Ocre. Sirve para la freedom?"* |
| 19 | Max | **"$6.486"** — el eco cuero **liso** + link de Mercado Pago |

**$9.765 − $6.486 = $3.279 cobrados de menos**, más el 10% de transferencia que llegó a ofrecer sobre
ese monto ya equivocado ($5.837).

---

## Por qué el control de precios de agosto NO lo agarró (y estuvo bien que no)

El reflejo es pensar que Max inventó el número. **No lo inventó:** `$6.486` es el precio real y
activo de "Cubreasiento Eco Cuero Fiat Strada D Cabina Impermeables Negro". `filtrarPrecios` lo dejó
pasar porque efectivamente salió de la herramienta, en ese turno, del catálogo.

> El precio era real. El **producto** era el equivocado.

Una auditoría de los 113 precios que el bot dijo en las últimas 100 charlas lo confirma: 97 son
precios reales de publicaciones activas, 11 son el 10% de transferencia bien calculado, y de los 5
restantes 2 los tipeó una persona del equipo. El filtro anti-invento **funciona**. El agujero era
otro.

---

## La causa raíz: tres cosas, ninguna era el filtro

1. **Max no se enteraba de a qué foto le respondía el cliente.** En WhatsApp, elegir entre varias
   fotos se hace **citando** una. La Cloud API manda ese vínculo en `message.context.id` y
   `whatsapp_meta.js` **nunca lo leía** — el único `contextInfo` que se miraba era el de los anuncios.
   El cliente señaló el capitoneado y Max vio un "Este me gusta" pelado.
2. **"Ocre" es ambiguo y nada lo detectaba.** Ocre, azul y blanca son costuras del **eco cuero** Y a
   la vez colores del **capitoneado**. Con las dos líneas sobre la mesa, el color solo no alcanza.
   Max desambiguó solo — y desambiguó para el lado barato.
3. **Nada frenaba el cobro.** Ni `consultar_precio` ni `crear_link_pago` verificaban que el precio
   perteneciera a la línea que el cliente venía eligiendo.

---

## Qué se hizo

### 1. Leer la foto citada (`src/citas.js`, nuevo)

Por cada foto/video que manda Max se recuerda qué producto era (`recordarEnviado(msgId, caption)`,
desde el id que devuelve Meta al enviar). Cuando el cliente responde citando, el turno le llega a Max
con **qué eligió exactamente**:

> `[Contexto interno — el cliente respondió CITANDO esta foto que le mandaste: "Capitoneado premium -
> Negro con costura ocre". Es ESA la que eligió: no le preguntes de nuevo cuál era.]`

Si el id no se reconoce (el proceso se reinició), **lo dice** en vez de suponer, y eso dispara la
pregunta. Degradar hacia preguntar es seguro; degradar hacia adivinar es lo que costó los $3.279.

⚠️ La nota arranca con `[Contexto interno —` **a propósito**: así `limpiarJerga` la corta si el modelo
la copia. Es la lección del 5 ago (ver `2026-08-05-lo-que-max-le-dice-al-cliente.md`), y hay caso de
prueba que lo cuida.

### 2. El color solo no cierra una venta (`eleccionAmbigua` en `cerebro.js`)

Si el cliente elige nombrando **un color** y ese color aparece en las fotos de **más de una línea**
que se le mostraron, Max no cotiza, no arma link y no anota el pedido: pregunta.

> *"Una cosa antes de seguir, para no pasarte un precio equivocado: el ocre lo tenés en capitoneado
> premium y en eco cuero, y no valen lo mismo. ¿Cuál de las dos es la que te gustó?"*

**Las líneas y los colores no están hardcodeados**: se leen de los captions de las fotos que Max
realmente mandó (la nota que deja `handler.js` en el historial). Si mañana se agrega un color o una
línea, esto lo toma solo.

Va en **dos capas**, porque una sola no alcanza:

- en `ejecutarHerramienta`, negando `consultar_precio`, `crear_link_pago`, `tomar_pedido` y
  `confirmar_transferencia`;
- en `armarRespuesta`, por si el modelo escribe el precio de memoria sin llamar a nada — se le caen
  los párrafos que nombren las líneas en disputa y queda la pregunta, una sola vez.

⚠️ **Al tocar esto:** la pregunta se le da al modelo TEXTUAL en la nota de la herramienta, así que la
copia casi siempre. Sin el filtro de párrafos, al cliente le llega **dos veces** — pasó en la primera
corrida del e2e. Y si se deja pasar un párrafo que afirma UNA línea ("tenemos la opción en eco
cuero"), contradice a la pregunta que viene abajo.

### Lo que NO se tocó

`filtrarPrecios` quedó igual: hacía bien su trabajo. Y el guard solo dispara cuando hay **dos o más
líneas mostradas con foto** y el cliente nombra **un** color sin nombrar la línea — si dice "el
capitoneado ocre", Max vende como siempre (hay caso de control en el e2e).

---

## Pruebas

```bash
node test_eleccion_ambigua.mjs     # 17 casos, sin red ni IA
node test_foto_citada.mjs          # 12 casos, sin red ni IA
node test_linea_ambigua_e2e.mjs    # 2 casos con la IA REAL: el de Vanessa + el control
```

El e2e replica la charla de Vanessa palabra por palabra y verifica lo único que importa: que **no
salga ningún precio** y que **no se arme cobro** hasta saber la línea.

---

## Pendiente (no se hizo acá a propósito, para no mezclar arreglos)

- **Toda** foto del cliente se guarda en el historial como `[comprobante #NNN]`
  (`handler.js:55`) — o sea, "comprobante de pago". Cuando el cliente manda una foto para **señalar
  un producto**, en los turnos siguientes Max la relee como si fuera un comprobante. No fue la causa
  de este bug, pero induce al mismo error.
- Los avisos al equipo no distinguen todavía "Max cerró una venta con precio confirmado" de "Max
  cerró una venta con un precio que dedujo". Un aviso así habría hecho visible este caso el mismo día.
