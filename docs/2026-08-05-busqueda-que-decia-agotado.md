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
- **Erratas de los títulos de ML** (`ERRATAS_ML`): "Alfomrba/Alombra/Alfomra" → alfombra,
  "Cuberasiento/Curbeasiento" → cubreasiento, "Chervolet" → Chevrolet, "Hyudndai" → Hyundai. Son
  **9 publicaciones activas** que, por la errata, no entraban en el filtro de categoría: al que
  pedía alfombra para su **Nivus**, **Tiggo 7**, **Ram Rampage**, **Changan CS55**, **Onix sedán**
  o **Ranger** (alfombra de caja) le decíamos que no había. La corrección se aplica solo al
  buscar; el catálogo no se toca.

Lo que **no** cambió: un vehículo que no trabajamos sigue sin resultados, y lo que está pausado de
verdad (la alfombra de caja de la Montana) se sigue informando como agotado con su aviso.

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

`test_busqueda_marca.mjs` (28 casos, sin red y sin IA) deja los dos casos fijos. `test_esperas.mjs`
(17) y `test_jerga_filtro.mjs` (8) siguen pasando.

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

## Cómo mirar la conversación real

Las charlas viven en Neon, no en el repo. Con el `NOTIFY_TOKEN`:

```
https://<url-del-bot>/api/conversaciones?clave=TU_NOTIFY_TOKEN&n=100
https://<url-del-bot>/api/agotados?clave=TU_NOTIFY_TOKEN&q=montana
```

La primera trae las últimas charlas completas (para buscar la de "montaña"); la segunda confirma,
en producción, qué publicaciones de Montana están caídas en este momento.
