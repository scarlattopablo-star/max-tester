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

## Qué se cambió (`src/cerebro.js`)

- **Palabras de la pregunta a la lista de genéricas.** "artículo/s", "accesorio/s", "producto/s",
  "hay", "tenés", "quiero", "necesito", "busco", "precio", "cuánto", "modelo", "marca",
  "camioneta", "hola"… Dejan de ser obligatorias (siguen sumando puntaje).
- **Segundo intento sin la marca.** Si la búsqueda estricta no devuelve nada, se repite sin exigir
  la marca (`MARCAS`): los títulos de ML no siempre la traen y a veces está mal escrita. El
  **modelo nunca se afloja** — es lo que evita ofrecerle el producto de otro auto (Yuan Pro ≠ Yuan
  Plus). La marca sigue puntuando, así que lo que sí la trae queda primero.
- **Se saca la puntuación de la consulta** antes de cortarla en palabras. Los títulos quedan como
  están: solo se limpia lo que escribe el cliente.

Lo que **no** cambió: un vehículo que no trabajamos sigue sin resultados, y lo que está pausado de
verdad (la alfombra de caja de la Montana) se sigue informando como agotado con su aviso.

## Verificación

Barrido de las 643 consultas que salen de los títulos del catálogo, antes vs. después:
**ninguna perdió resultados** y **18 que daban cero ahora encuentran producto** — entre ellas
"Alfombra Ford Ranger 100 % Goma", "Alfombra Chevrolet Onix 2025 Bandeja Rígida 3D",
"Alfombras Hyundai Hb20", "Alfombra Ómoda 5 Baúl": todas eran el mismo falso "agotado".

`test_busqueda_marca.mjs` (16 casos, sin red y sin IA) deja el caso fijo. `test_esperas.mjs` (17) y
`test_jerga_filtro.mjs` (8) siguen pasando.

## Para el dueño, aparte del código

- 📌 La publicación **MLU715663846** dice **"Alfombra Chervolet Montana 100 % Goma Negro"**. El
  código ya lo tolera, pero conviene corregir el título en Mercado Libre: con la marca mal escrita,
  el buscador de ML tampoco la muestra a quien busca "Chevrolet".
- 📌 De las 5 publicaciones de Montana pausadas, la de **alfombra de caja** es la única que no
  tiene equivalente activa: si esa mercadería está en el local, hay que reactivar la publicación
  (Max se guía por el estado en Mercado Libre).

## Cómo mirar la conversación real

Las charlas viven en Neon, no en el repo. Con el `NOTIFY_TOKEN`:

```
https://<url-del-bot>/api/conversaciones?clave=TU_NOTIFY_TOKEN&n=100
https://<url-del-bot>/api/agotados?clave=TU_NOTIFY_TOKEN&q=montana
```

La primera trae las últimas charlas completas (para buscar la de "montaña"); la segunda confirma,
en producción, qué publicaciones de Montana están caídas en este momento.
