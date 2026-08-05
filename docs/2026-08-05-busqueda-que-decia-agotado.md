# Max decía "agotado" con la mercadería en stock

**5 de agosto de 2026** · reporte de Pablo Scarlatto: *"le preguntan por artículos para montaña y
responde que no hay stock"*

## Qué se verificó

El stock de la **Chevrolet Montana está bien**. En el snapshot del catálogo (`src/productos_ml.json`,
sincronizado el 3 de agosto) hay **4 publicaciones ACTIVAS**:

| Producto | Precio |
|---|---|
| Alfombra Montana Bandeja Negro | $ 3.612 |
| Alfombra **Chervolet** Montana 100 % Goma Negro | $ 1.267 |
| Cubreasiento Chevrolet Montana Cuero Ecologico Negro | $ 12.500 |
| Cubreasiento Chevrolet Montana Eco Cuero A Medida Negro | $ 6.800 |

Y **5 pausadas** (esas sí están agotadas de verdad): juego de alfombras 2023+, alfombra de caja,
goma + cubre caja, bandeja rígida + caja rígida, y goma látex + cubresócalos.

O sea: no era un problema de stock. Era la **búsqueda**, que devolvía cero y de ahí Max se iba a la
lista de agotados —donde la Montana sí figura— y le contestaba al cliente que no había.

## Por qué devolvía cero

La búsqueda exige que el título del producto contenga **todas** las palabras "fuertes" de la
consulta. Tres cosas la rompían:

1. **Las palabras con las que el cliente arma la pregunta.** "artículos", "accesorios", "tenés",
   "necesito", "precio" no están en ningún título de Mercado Libre, así que exigirlas dejaba la
   búsqueda en cero. Literalmente el caso reportado: *"artículos para montaña"* → 0 resultados.
2. **La marca.** Los dos títulos activos de alfombras de Montana dicen "Montana" a secas y
   ⚠️ **"Chervolet"** (mal escrito en la publicación de Mercado Libre). Si el cliente —o Max al
   armar la consulta— escribía "Chevrolet Montana", no coincidía con ninguno de los dos.
3. **La puntuación.** "hola, necesito algo para mi montana" buscaba la palabra `hola,` —con la
   coma— dentro de los títulos.

Los tres caminos terminaban igual: 0 activos → se busca en agotados → "estamos sin stock".
La **ñ** no tenía nada que ver: "montaña" y "montana" ya se buscaban igual.

## Segundo reporte, mismo día: el HB20

*"Le piden para hb20 que también hay en stock y dice que no hay"*. Del **Hyundai HB20** hay **8
publicaciones activas** (3 cubreasientos, 5 alfombras). Aparecieron dos fallas más de la misma
familia, que el primer arreglo no cubría:

- **La marca no solo dejaba en cero: además ESCONDÍA productos.** "cubreasiento hyundai hb20"
  devolvía **1** de los 3 —el único cuyo título dice "Hyundai"— y tapaba las dos opciones a
  medida, que son las más baratas ($ 6.500 y $ 8.900). El primer arreglo solo aflojaba la marca
  cuando el resultado era cero, así que este caso pasaba de largo. Ahora la marca no se exige
  nunca mientras el cliente haya nombrado el modelo: solo puntúa (lo que sí la trae queda primero).
- **El modelo escrito con espacio.** El cliente escribe "hb20" y el título dice "Hb 20" (pasa
  igual con "ev4"/"EV 4"). Por eso "cubrevolante hb20" contestaba que no lo trabajábamos, cuando
  en realidad existe y está agotado. Ahora se prueban las dos formas, en los dos sentidos.

## Tercera pasada: la regla completa, no los casos sueltos

*"Si querés un artículo y te ofrecen otro no tiene sentido, así con cualquier modelo.
Es sumamente importante que Max responda con claridad si hay o no en stock, que no
invente ni se equivoque."*

Se auditó el catálogo entero —una consulta por cada vehículo— en vez de mirar los casos
reportados. Apareció una familia que las dos pasadas anteriores no tocaban: **los
modelos que se llaman como una palabra genérica o como un número**. Quedaban tapados
por la lista de palabras genéricas y la respuesta salía por marca, o sea, con el auto
de otro:

| El cliente pedía | Max le ofrecía |
|---|---|
| Cubreasiento **Suzuki Alto** | el Celerio y el Swift (el Alto, tercero) |
| Alfombra **VW T-Cross** | el Polo y el Nivus |
| Cubreasiento **Ford EcoSport** | la Ranger |
| Cubreasiento **Peugeot 208** | el 2008 y la Landtrek |
| Alfombra **Peugeot 2008** | el 3008 y el 308 |
| Alfombra **JAC 1035** | el JAC 1083 |
| Alfombra **Fiat 500** (no lo trabajamos) | la Toro |

Además, escrito de otra forma el mismo auto no aparecía: "ecosport" todo junto o
"volkswagen t cross" separado daban **cero**.

Y un caso que no era de modelo sino de honestidad: **"¿tenés alfombras?"**, sin decir el
auto, devolvía 6 productos con precio. Max podía cotizar el de cualquier vehículo.

## Qué se cambió (`src/cerebro.js`)

- **Palabras de la pregunta a la lista de genéricas.** "artículo/s", "accesorio/s", "producto/s",
  "hay", "tenés", "quiero", "necesito", "busco", "precio", "cuánto", "modelo", "marca",
  "camioneta", "hola"… Dejan de ser obligatorias (siguen sumando puntaje). Lo mismo con las
  terminaciones que comparten marcas distintas ("carbono", "genuino", "vinilo", "sport") y con
  "volante", que es una categoría y no un dato del auto.
- **La marca deja de ser obligatoria** mientras el cliente haya nombrado el modelo. Los títulos de
  ML no siempre la traen y a veces está mal escrita. Sigue puntuando, así que lo que sí la trae
  queda primero. El **modelo nunca se afloja** — es lo que evita ofrecer el producto de otro auto.
- **Se saca la puntuación de la consulta** antes de cortarla en palabras. Los títulos quedan como
  están: solo se limpia lo que escribe el cliente.
- **El modelo con espacio se prueba en los dos sentidos**: "hb20" encuentra "Hb 20" y al revés.
- **Se busca por PALABRA ENTERA, no por pedazo de palabra.** Es la contracara de aflojar la
  marca: sin ella, "c4" matcheaba el Volvo x**c4**0, "x1" el BMW **i**X1, "gol" el **Golf** y
  "tera" las alfombras **delanteras**. Aflojar la marca sin esto metía 8 resultados de otra marca
  en el barrido; con esto quedan **0**, uno menos que en producción.
- **El número de una cifra es del modelo, no un año**: "Tiggo 2" ya no trae el Tiggo 7. Los
  números que cuentan algo ("4 puertas", "10 mm") se descartan antes de buscar.
- **El número que va detrás de la marca es el modelo** ("Peugeot 208", "Fiat 500", "JAC 1035") y
  por eso es obligatorio. Los años quedan afuera —"un Toyota 2015" no es el modelo 2015— salvo que
  el catálogo los use como nombre: el Peugeot 2008 existe y se llama así, y eso el código lo saca
  del propio catálogo (`modelosNumericos`), así que se mantiene solo cuando cambia el stock.
- **Modelos tapados por palabras genéricas** (`MODELOS_TAPADOS`): "eco sport", "t cross",
  "corolla cross" y "alto" vuelven a contar como modelo. El de una sola palabra pide además la
  marca, para no confundir el **Alto** con "alta densidad".
- **La misma escritura para todos**: "ecosport" = "Eco Sport" = "Eco Esport" (errata de ML), y
  "T-Cross" = "t cross". Consulta y títulos pasan por la misma cocina.
- **Sin saber el auto, no se cotiza** (`falta_modelo`): si el cliente no dijo el vehículo, la
  herramienta ya no devuelve productos — le dice a Max que pregunte marca y modelo. La marca sola
  no alcanza: "cubreasientos para mi Peugeot" no dice si es un 208 o un 3008.
- **La versión se confirma** (`confirmar_version`): si todo lo que hay es de una versión —Yuan
  **Plus**, Song **Pro**— y el cliente no dijo cuál tiene, Max se la confirma antes de cerrar.
- **Erratas de los títulos de ML** (`ERRATAS_ML`): "Alfomrba/Alombra/Alfomra" → alfombra,
  "Cuberasiento/Curbeasiento" → cubreasiento, "Chervolet" → Chevrolet, "Hyudndai" → Hyundai. Son
  **9 publicaciones activas** que, por la errata, no entraban en el filtro de categoría: al que
  pedía alfombra para su **Nivus**, **Tiggo 7**, **Ram Rampage**, **Changan CS55**, **Onix sedán**
  o **Ranger** (alfombra de caja) le decíamos que no había. La corrección se aplica solo al
  buscar; el catálogo no se toca.

Lo que **no** cambió: un vehículo que no trabajamos sigue sin resultados, y lo que está pausado de
verdad (la alfombra de caja de la Montana) se sigue informando como agotado con su aviso.

### Cómo queda la respuesta al cliente

Cuando "consultar_precio" o "enviar_foto" no devuelven productos, ahora hay **tres** casos, y el
prompt los distingue (`# PRODUCTO AGOTADO / QUE NO TRABAJAMOS`):

| La herramienta dice | Max responde |
|---|---|
| `falta_modelo: true` | pregunta marca y modelo. **No** da precio ni dice que no hay |
| `agotado: true` | "de eso no hay ahora" + ofrece avisarle cuando entre |
| `agotado: false` | "no lo tenemos", hablando de ese producto y de ese auto |

## Verificación

Dos barridos automáticos contra el catálogo real, comparando con lo que hay en producción
(`bc0965c`):

| Barrido | Antes | Ahora |
|---|---|---|
| 380 consultas "categoría + marca + modelo" — devuelven CERO | 161 | **148** |
| las mismas — resultados **de otra marca** | 1 | **0** |
| 643 consultas armadas con los títulos del catálogo — pasan de cero a encontrar | — | **26** |

Entre las que se recuperaron: Ford Ranger, Chevrolet Onix, Ford EcoSport, VW Amarok, VW Nivus,
Fiat Fastback, Toyota Hilux Revo, Changan CS55, HB20 hatch y sedán, y la Montana. Las que dejaron
de devolver resultados devolvían **el producto de otro auto** (un Tiggo 2 al que pidió Tiggo 7, un
iX1 al que pidió X1, un cubrevolante Fiat al que pidió uno de HB20): ahí Max ahora dice que está
agotado y ofrece avisar, que es lo correcto.

### La regla, probada sobre el catálogo entero

`test_no_ofrecer_otro_auto.mjs` no mira casos sueltos: arma la consulta de un cliente para **cada
vehículo del catálogo** y revisa las tres cosas que pueden salir mal. Hoy da:

| Qué revisa | Resultado |
|---|---|
| 190 consultas — ¿alguna devuelve el producto de OTRO auto? | **0** |
| ¿algún producto a la venta queda invisible? | **0** |
| 137 sin stock — ¿se avisan como agotado **del mismo auto**? | **137 de 137** |

Es la prueba que hay que correr cuando se toca la búsqueda: se mantiene sola contra el catálogo
que haya en ese momento, y avisa si el snapshot está vacío en vez de dar un verde falso.

`test_busqueda_marca.mjs` (52 casos, sin red y sin IA) deja fijos los casos concretos.
`test_esperas.mjs` (17) y `test_jerga_filtro.mjs` (8) siguen pasando.

## Para el dueño, aparte del código

- 📌 La publicación **MLU715663846** dice **"Alfombra Chervolet Montana 100 % Goma Negro"**. El
  código ya lo tolera, pero conviene corregir el título en Mercado Libre: con la marca mal escrita,
  el buscador de ML tampoco la muestra a quien busca "Chevrolet".
- 📌 De las 5 publicaciones de Montana pausadas, la de **alfombra de caja** es la única que no
  tiene equivalente activa: si esa mercadería está en el local, hay que reactivar la publicación
  (Max se guía por el estado en Mercado Libre).
- 📌 Del **HB20 hay 8 publicaciones pausadas** (cubrevolante, tela tapicería, cuero ecológico
  2023-2025, baúl sedán engomado, goma + cubresócalos, piso + baúl…). Max las informa como
  agotadas y ofrece avisar. Si alguna de esas está en el local, hay que reactivarla en ML.
- 📌 **27 títulos tienen la palabra del producto mal escrita** (9 activos, 18 pausados):
  "Alfomrba", "Alfombrra", "Alfomra", "Alombra", "Cuberasiento", "Curbeasiento", más "Hyudndai".
  El código ya las tolera, pero en Mercado Libre esas publicaciones no aparecen cuando alguien
  busca "alfombra": es venta perdida en ML, no en Max. Los activos a corregir son MLU650874169,
  MLU726518848, MLU727107392, MLU650913337, MLU911278612, MLU693369035, MLU693423729,
  MLU694588907 y MLU1472721464.

## ✅ Desplegado

El bot de producción (`max-tester.onrender.com`) se despliega desde **`main`**. Todo esto se mergeó
y está EN VIVO desde el 5 de agosto de 2026 (`e6a0750`). Lo que siguió después está al final, en
"Segunda tanda".

Dos cosas más, para que el despliegue cierre de verdad los casos ya abiertos:

- **Max no puede repetirse de memoria.** Si en la misma charla ya dijo "no hay", el prompt ahora le
  prohíbe repetirlo sin volver a llamar a la herramienta: el stock se sincroniza cada 30 minutos y
  su respuesta anterior pudo ser un error. Manda la herramienta, no lo que él mismo dijo antes.
- **`GET /api/esperas?clave=NOTIFY_TOKEN`** (nuevo): quiénes quedaron anotados esperando y qué
  buscaban. Son los clientes a los que se les dijo "no hay" — con la lista se los puede llamar y
  recuperar la venta. Acepta `?q=montana` para filtrar por producto.

## Cómo mirar la conversación real

Las charlas viven en Neon, no en el repo. Con el `NOTIFY_TOKEN`:

```
https://<url-del-bot>/api/conversaciones?clave=TU_NOTIFY_TOKEN&n=100
https://<url-del-bot>/api/agotados?clave=TU_NOTIFY_TOKEN&q=montana
```

La primera trae las últimas charlas completas (para buscar la de "montaña"); la segunda confirma,
en producción, qué publicaciones de Montana están caídas en este momento.

---

# Segunda tanda, mismo día: seguía diciendo "no hay"

Con lo de arriba ya en producción, Max **seguía** contestando que no había con mercadería en stock.
La causa de fondo no eran los casos sueltos sino **el punto ciego de las pruebas**:

> Los test armaban la consulta **copiando el título de la publicación**. Nunca probaban lo único que
> pasa en la vida real: que el cliente escribe el modelo de otra forma que la cargada en Mercado
> Libre, o directamente lo escribe mal. Por eso todo daba verde y el error seguía vivo.

## Lo que faltaba (5 arreglos más)

| # | Qué pasaba | Ejemplo real | Commit |
|---|---|---|---|
| 1 | El modelo con **guión o espacio** daba cero | el título dice `Changan Unit`, el cliente escribe `Uni-T`; `L200` vs `L 200` | `ecc1a8f` |
| 2 | Modelos que se distinguen por **una letra** se cruzaban | al del `Geometry C` le salía PRIMERO el `Geometry E` | `ecc1a8f` |
| 3 | La palabra del producto tapaba el `falta_modelo` | "quiero una alfombra antiderrame" cotizaba sin saber el auto | `ecc1a8f` |
| 4 | El **acabado** que al título le falta dejaba la venta en cero | "alfombra **3d** para montana" → la bandeja está publicada como `Alfombra Montana Bandeja`, sin el "3d" | `252bb29` |
| 5 | El catálogo tiene **el mismo auto cargado de dos formas** | `Changan Unit` y `Changan U-nit`; la marca `Dong Feng` separada | `79c6b9c` |
| 6 | El cliente que **escribe mal** no encontraba nada | `alfonbra`, `hylux`, `montanna`, `chebrolet`, `hiundai` | `83a5864` |

### Las decisiones que no son obvias

- **`NO_ES_AUTO` va aparte de `STOP_BUSQUEDA`.** Las palabras del producto no pueden contar como el
  modelo, pero en la búsqueda sí separan productos del mismo vehículo: si se vacían, al que pide la
  alfombra **de caja** le sale la **de bandeja**.
- **`ACABADO_PRODUCTO` (3d, 5d, antiderrame, latex) suma puntaje pero NO filtra**, igual que la
  marca. La **PIEZA** (caja, baúl, socalo) sí se sigue exigiendo: son partes distintas y cambiárselas
  al cliente es venderle lo que no pidió.
- **Los modelos por letra salen del CATÁLOGO, no de una lista a mano.** Una palabra cuenta como
  variante solo si aparece con dos letras distintas: eso separa un modelo real ("Geometry C/E") de
  una preposición del título ("Cuero **A** Medida").
- **Un número detrás de una MARCA no se pega**: `jac 42` es el JAC 42, no un "jac42" inexistente.
  El `100` tampoco: sale de "100 % goma".
- **El corrector de tipeos va contra el vocabulario del propio catálogo**, con dos candados, porque
  acá el riesgo es al revés —empujar la palabra al auto más parecido sería venderle el de otro:
  1. solo se toca lo que **no existe en ningún título** (un modelo real nunca se corrige);
  2. solo si hay **un único candidato** a esa distancia; con empate no se toca.
  Los alfanuméricos quedan afuera (`l200`, `c4`, `208`, `hb20`, `Geometry C`): ahí una cifra o una
  letra **es otro auto**. Por eso `alfombra para ferrari` sigue dando cero, que es lo correcto.
  Costo medido: ~7 ms por búsqueda.

## Las pruebas nuevas (lo más importante de esta tanda)

Ninguna elige casos a mano: **barren el catálogo**, así que si mañana entra una publicación con el
mismo problema, fallan solas.

```
node test_cliente_escribe_distinto.mjs   # el cliente escribe el modelo distinto a como está en ML
node test_cliente_escribe_mal.mjs        # el cliente escribe MAL (una letra cambiada en cada modelo)
node test_no_ofrecer_otro_auto.mjs       # la regla sobre el catálogo entero
```

`test_cliente_escribe_distinto` encontró sola los casos `Changan U-nit` y `Dong Feng`, mirando qué
token aparece pegado en un título y partido en otro. `test_cliente_escribe_mal` le cambia una letra
a cada modelo del catálogo y exige que se siga encontrando; verificado contra producción: **147
modelos, 371 de 381 variantes con una letra cambiada devuelven exactamente lo mismo** (los 10
restantes no son modelos, son palabras del producto truncadas en los títulos).

⚠️ `test_variantes_modelo` usa la IA real: no es determinístico, la redacción de Max varía entre
corridas. Los de arriba corren sin red y sin IA.

## Verificación en producción

Las cuatro consultas reales de los dos clientes a los que se les dijo que no había, contra el
catálogo vivo:

| Cliente preguntó | Max le dijo | Ahora |
|---|---|---|
| `tenes para montana` | "está agotado, no tenemos en stock" | ✅ 4 productos |
| `tenes alfomrba montana` | "la tenemos agotada" | ✅ 4 productos |
| `Alfombra 3d para montana 25` | "la tenemos agotada" | ✅ 2 productos |
| `ALFOMBRA HB20` | "está agotado, no tenemos en stock" | ✅ 5 productos |

## 📞 Clientes a los que se les dijo "no hay" habiendo stock

Salieron de barrer las 100 conversaciones y cruzarlas con el catálogo activo. **`/api/esperas` NO
alcanza para esto**: solo tiene 31 anotados y de esos uno solo tiene producto disponible hoy — a los
del error Max no los anotó, los derivó o se fueron.

| Teléfono | Preguntó por | Qué había |
|---|---|---|
| 098 047 499 | Montana (3 veces) y HB20 | 4 y 5 productos activos |
| 095 563 501 | alfombra 3D para Montana 2025 | 2 activos; se fue tras preguntar por tarjetas |
| 099 522 361 | Peugeot 2008 | había un `Cubreasiento Peugeot 2008 Allure`, y Max le ofreció el **208** |

## Pendiente en Mercado Libre (no es código)

- **9 activas con la palabra del producto mal escrita.** Max ya las encuentra, pero **ML no**: no
  aparecen cuando alguien busca "alfombra" ahí. `MLU650874169`, `MLU726518848`, `MLU727107392`,
  `MLU650913337`, `MLU911278612`, `MLU693369035`, `MLU693423729`, `MLU694588907`, `MLU1472721464`.
  Más `MLU715663846` ("Chervolet") y `MLU613492709` ("Hyudndai", pausada).
- **Publicaciones pausadas con mercadería en el local.** Montana tiene 5 pausadas y el HB20 9. Max
  se guía por el estado en ML: mientras estén pausadas va a decir "agotado" de esas, correctamente.
  Si la mercadería está, hay que reactivarlas.

## Cómo verificar un deploy de Max

`/api/estado` → si `ultimaSync.cuando` salta a una hora nueva, el proceso reinició con el build
nuevo (queda unos segundos en `null` en el medio). Render despliega desde `main` por un git hook
**pre-push local**: mergear un PR en GitHub NO lo dispara.

⚠️ Los test versionados están en `.gitignore` (`test_*.mjs`): se agregan con `git add -f`.
