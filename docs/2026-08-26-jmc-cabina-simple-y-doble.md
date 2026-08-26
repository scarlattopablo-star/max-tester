# Los camiones JMC: doble cabina y cabina simple cotizados igual

**26 de agosto de 2026.** Misma familia que el caso de la Strada del 7 de agosto
(`2026-08-07-cabina-y-version-del-auto.md`), pero esta vez el guard que existía **no alcanzaba**:
no estaba muerto, estaba ciego a la mitad del catálogo.

Reportado por Pablo: *"Max está cotizando los camiones JMC de doble cabina y de cabina simple de la
misma manera."*

---

## Lo que hay publicado en Mercado Libre

| | Publicación | Precio |
|---|---|---|
| ACTIVA | Cubreasiento Jmc **Doble Cabina** Jx1044 Cuero Ecologico Negro | $18.000 |
| ACTIVA | Cubreasiento Jmc Grand Avenue Cuero Automotriz Alta Gama Negro | $18.000 |
| ACTIVA | Cubreasiento Jmc Ev3 Cuero Ecológico Alta Gama Gris | $9.500 |
| ACTIVA | Cubreasientos Jmc **N822 2850** Eco Cuero Impermeables Negro | $6.900 |
| ACTIVA | Cubreasiento Jmc **N822 2850** Carryng Plus Cuero Ecologico Negro | $11.900 |
| pausada | Alfombra Bandeja Camion Jmc N822 2850 **Cab Simple** Negro | — |
| pausada | Alfombra 5d Bandeja Jmc **Doble Cabina** N822 2850 Negro | — |

De las cinco publicaciones activas, **una sola declara la cabina**: la del JX1044. Y las dos
alfombras pausadas son la prueba de que el **N822 2850 se vende en las dos cabinas** — Mercado Libre
tiene una publicación para cada una.

## Qué hacía Max (comprobado con el catálogo real)

```
"cubreasiento para mi camión JMC doble cabina"   → 0 resultados
"cubreasiento para mi camión JMC cabina simple"  → 0 resultados
```

Las dos consultas terminaban en la **misma respuesta palabra por palabra**: la frase de la excepción
JMC (*"sí tenemos cubreasientos para todos los modelos de JMC"*) más el pase a un asesor. Literalmente
cotizadas de la misma manera.

Y cuando el cliente sí nombraba el modelo:

```
"cubreasiento jmc n822 2850"  → $6.900 y $11.900, sin preguntar nada
```

Los mismos dos precios para el que tiene el N822 de cabina simple y para el que tiene el de doble.

## Por qué

Tres causas encadenadas. Ninguna era el filtro de cabina "muerto" del 7 de agosto: ese sigue vivo.

1. **`"camión"` no estaba en `STOP_BUSQUEDA`.** `"camioneta"` y `"pickup"` sí, `"camión"` no. Como
   toda palabra que no es genérica se vuelve **obligatoria dentro del título**, y NINGÚN cubreasiento
   del catálogo dice "camión", la búsqueda daba cero. El tipo de vehículo no es un modelo: no se
   exige. **Ésta es la causa del "de la misma manera"**: los dos caminos daban cero y de un cero solo
   sale una respuesta genérica.

2. **`_matchCabina` trataba a la publicación muda como universal.** "Sin cabina en el título, sirve
   para cualquiera" es cierto para un auto, y falso para un camión que se vende en las dos: los
   cubreasientos del N822 2850 no dicen cuál son, así que sobrevivían al filtro de "doble cabina"
   **y** al de "cabina simple". Las dos listas compartían 4 de 5 productos y el $6.900 encabezaba
   las dos.

3. **`mezclaCabinas()` solo contaba las cabinas DECLARADAS.** Con una sola publicación JMC que la
   declara, el conjunto parecía unánime, `faltaCabina()` no saltaba nunca y Max cotizaba sin
   preguntar. El freno que salvó a la Strada no servía acá porque la Strada tiene **las dos** cabinas
   escritas en los títulos y el JMC tiene **una**.

De yapa, el lector de cabinas leía el título con `_normTxt` y no con `_tituloDe` — la cocina que usa
la búsqueda. Por eso no veía `D/cabina` (la barra sobrevivía) ni `Pik Up`. **El VW Saveiro tenía
exactamente el mismo bug**: "saveiro doble cabina" y "saveiro cabina simple" devolvían las mismas dos
publicaciones ($9.500 D/cabina y $5.900 Pik Up) en el mismo orden.

## Qué se hizo

Todo sale del catálogo. **No se infiere ninguna cabina** que Mercado Libre no escriba.

- **`"camion"` / `"camiones"` → `STOP_BUSQUEDA`**, al lado de `"camioneta"` y `"pickup"`.
- **`cabinaDelProducto()` lee el título con `_tituloDe`** y suma las notaciones que faltaban:
  `D/cabina`, `D Cab`, `Cab. Simple`, `C/Simple` y `Pik Up` / `Pick Up` a secas (que `_tituloDe`
  unifica en `pickup`). ⛔ Ese último vale **solo para títulos**: en el mensaje del cliente "tengo una
  pickup" es la carrocería y no dice nada de la cabina. Y el **VW Up no se confunde**: el patrón exige
  `pik|pick|pic` delante.
- **`modelosDeDosCabinas()`** — nuevo, y no es una lista a mano: recorre el catálogo entero (activos y
  pausados) y marca el vehículo del que hay un título que dice "Cab Simple" y otro que dice "Doble
  Cabina". Hoy salen tres: **Fiat Strada, VW Saveiro y JMC N822 2850**. Si mañana aparece otro, entra
  solo.
- **`cabinaAmbigua(titulo)`** — la publicación que no declara la cabina y es de uno de esos vehículos
  no es "sirve para cualquiera": es **"no sabemos cuál es"**.
- **`mezclaCabinas()`** cuenta la ambigua como una cabina más ⇒ `faltaCabina()` vuelve a frenar y Max
  **pregunta** antes de cotizar el N822.
- **El filtro** (`_matchCabina` + `aplicarCab`): la que declara la otra cabina se va, como siempre;
  la ambigua sobrevive **solo si es del MISMO vehículo** que alguna que sí la declara. La
  "Doble Cabina Jx1044" no cubre al N822 aunque los dos sean JMC; el capitoneado de la Strada sí
  acompaña a la "Strada D Cabina", porque es el mismo camión con otra línea.
- **`cabinaSinConfirmar()`** — el cliente ya dijo la cabina pero ninguna publicación la declara (los
  dos cubreasientos del N822). El precio es real y se pasa, pero nombrando la publicación tal cual y
  **confirmándole la cabina antes de cerrar**. Mismo criterio que `versionSinConfirmar` (Yuan Pro,
  Polo Track). ⛔ Nunca se le asegura que es la de su cabina: eso no lo sabemos.

## Cómo quedó

```
"camión JMC doble cabina"   → JX1044 $18.000 · Grand Avenue $18.000 · EV3 $9.500
"camión JMC cabina simple"  → N822 $6.900 · N822 $11.900 · Grand Avenue $18.000 · EV3 $9.500
"cubreasiento jmc n822 2850" → NO cotiza: pregunta si es cabina simple o doble
"saveiro doble cabina"      → solo la D/cabina $9.500
"saveiro cabina simple"     → solo la Pik Up $5.900
```

Con la marca sola (`"camión JMC doble cabina"`) el guard de `identificaModelo()` sigue mandando: Max
pregunta el **modelo** antes de tirar un precio, porque JMC son cinco vehículos distintos. Lo que
cambió es que ya no hay dos ceros idénticos detrás, y que cuando el cliente contesta el modelo el
precio que sale es el de **su** cabina.

## Pruebas

```bash
node test_cabina_jmc.mjs      # 32 casos, sin red ni IA
```

Regresión offline entera en verde: `test_busqueda_marca` (53), `test_cliente_escribe_distinto` (48),
`test_cliente_escribe_mal` (34), `test_no_ofrecer_otro_auto` (3, barre 192 consultas),
`test_precios_reales` (20), `test_jerga_filtro` (8), `test_no_filtrar_contexto_interno` (14).
**La Fiat Strada no perdió ni una línea**: es el control de no-regresión del punto 8 del test.

Los que usan la IA real (`test_variantes_modelo`, `test_agotados_e2e`, `test_modelos_y_retiro`,
`test_sin_jerga`) **no se corrieron**: este entorno no tiene las claves de OpenAI/Anthropic.

## La regla de fondo

> Que el título **no diga** la cabina no quiere decir que sirva para las dos. Quiere decir que **no
> sabemos** cuál es — y eso se pregunta, no se supone.

El guard del 7 de agosto asumía que el catálogo siempre escribe las dos cabinas. Alcanzaba para la
Strada, que las escribe, y no para el JMC, que escribe una sola. **Un filtro que depende de que el
dato esté escrito necesita saber qué hacer cuando no está.**
