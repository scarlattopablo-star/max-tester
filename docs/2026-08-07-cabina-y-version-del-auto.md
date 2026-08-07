# La cabina y la versión: cotizarle a un auto el producto de otro auto

**7 de agosto de 2026**, el mismo día que el bug del color (ver
`2026-08-07-el-color-no-dice-que-linea.md`) y de la misma familia que el Yuan Pro / Yuan Plus del 3
de agosto: **el precio es real, el producto es de otro vehículo.**

Salió de revisar las conversaciones del día buscando otra cosa. Dos casos, los dos en producción.

---

## Caso 1 — la Strada de 2 asientos ofrecida a una Freedom

Buscando `cubreasiento strada freedom`, el catálogo le devolvía a Max **seis** publicaciones juntas:

```
$9.765  Strada Cuero Ecologico Capitoneado Negro
$6.500  Strada Pik Up 2 Asientos          ← cabina simple
$9.919  Strada Nueva Capitoneados ROJO
$6.486  Eco Cuero Strada D Cabina         ← doble cabina
$599    Strada Freedom + Lona Maritima
$8.900  Strada Tela Tapiceria
```

Max las mezcló y ofreció *"el eco cuero económico ronda los **$6.500**"* — que es la de **2
asientos**. La que corresponde a una Freedom doble cabina es la **D Cabina, $6.486**.

### El filtro ya existía. Estaba muerto.

`cabinaDe()` / `_matchCabina()` estaban en `cerebro.js` desde antes. Comprobado en vivo:

```
"cubreasiento strada doble cabina"  → los mismos 6 resultados
"cubreasiento strada cabina simple" → los mismos 6 resultados
"cubreasiento strada 2 asientos"    → los mismos 6 resultados
```

**Dos causas encadenadas, y las dos "tenían razón" por separado:**

1. **El filtro no hablaba el idioma del catálogo.** Buscaba `"doble cabina"` y `"cabina simple"`,
   pero Mercado Libre dice **`"D Cabina"`** y **`"Pik Up 2 Asientos"`**. Como es un filtro *suave*
   (solo aplica si algo coincide), no coincidía nada y no filtraba nunca. Peor: si el cliente decía
   "doble cabina", `_matchCabina` **descartaba justamente la "D Cabina"**, que era la correcta.
2. **La consulta llegaba sin la frase que el filtro busca.** `_terminos()` borra a propósito los
   números que cuentan (`"2 asientos"`, `"4 puertas"`, `"10 mm"`) para que no se confundan con el
   número del modelo (Tiggo 2, Yuan 3) — que son **exactamente** las frases del filtro de cabina. Se
   anulaban entre sí. Por eso ahora `cabinaDe()` se calcula sobre la consulta **original**.

### Qué se hizo

- `cabinaDelProducto(titulo)` lee la cabina como la escribe el catálogo (`D Cabina`, `Pik Up 2
  Asientos`, `Doble Cabina`, `Cabina Simple`).
- Si el cliente dijo la cabina, el filtro **ahora sí** actúa. Y `conVarianteDelCliente()` se la
  devuelve a la búsqueda si Max la perdió al armar la consulta (mismo mecanismo que ya existía para
  el Yuan Pro).
- Si **no** la dijo y los resultados **mezclan** las dos, `faltaCabina()` frena la cotización y Max
  pregunta: *"¿tu Strada Freedom es cabina simple (2 asientos) o doble cabina?"* — en
  `consultar_precio` **y** en `enviar_foto`, porque el caption de cada foto lleva el precio: **mandar
  fotos ES cotizar**.

⚠️ **No se infiere la cabina del nombre de la versión.** Es tentador decir "Freedom = doble cabina",
pero la Strada Freedom se vende en Cabine Plus y en Cabine Dupla. Preguntar es correcto; suponer
sería el mismo error con otro disfraz.

---

## Caso 2 — el Polo Track cotizado a un Polo Comfortline

Un cliente con **Polo Comfortline** preguntó el precio y Max contestó **$11.610** sin aclarar nada.
Ese es el precio de `Cubreasiento Vw Polo **Track 2024**` — la **única** publicación de Polo que hay.
El Polo Track es otro auto.

También existía el mecanismo (`versionSinConfirmar`, del caso Yuan Pro) y tampoco disparó, por **dos
motivos distintos**:

1. **`"track"` no estaba en ninguna de las dos listas.** Y son dos: `VARIANTES` (que **detecta** la
   palabra en un texto) y `VERSIONES_AUTO` (que decide cuáles son "otro auto"). Agregarlo solo a la
   segunda no alcanza — hay que ponerlo en las dos, y quedó comentado en el código.
2. **El guard estaba solo en `consultar_precio`.** Para el Polo, Max resolvió con `enviar_foto`, que
   no lo tenía. Ahora lo tiene.

Resultado: *"El eco cuero lo encontré para la **versión Track** en $11.610"*, y se le pide confirmar
la versión antes de cerrar.

---

## Pruebas

```bash
node test_cabina.mjs               # 23 casos, sin red ni IA
node test_variante_auto_e2e.mjs    # 3 casos con la IA REAL (Strada, Polo y un control)
```

Regresión corrida entera: `test_busqueda`, `test_busqueda_marca`, `test_cliente_escribe_distinto`
(48), `test_cliente_escribe_mal` (34), `test_agotados_e2e`, `test_modelos_y_retiro` (6/6) —
todo en verde. La búsqueda no perdió resultados.

---

## La regla de fondo

> Cuando un filtro "no molesta nunca", sospechar que **está muerto**, no que no hace falta.

Los dos guards de este archivo ya existían y los dos estaban inertes: uno porque no hablaba la
notación del catálogo, el otro porque le faltaba una palabra en una de las dos listas. **Un filtro
sin un test que lo vea filtrar de verdad es decorativo.** Por eso `test_cabina.mjs` no comprueba solo
que el filtro exista: comprueba que con "doble cabina" la de 2 asientos **desaparece** de los
resultados.

## Pendiente

- `VARIANTES` / `VERSIONES_AUTO` son listas a mano (`pro`, `plus`, `gt`, `turbo`, `hybrid`, `track`).
  Cada versión nueva que aparezca en el catálogo hay que agregarla. Vale la pena revisar los títulos
  cada tanto buscando palabras de versión que no estén.
- Queda sin resolver si el precio del capitoneado **Rojo** ($9.919) puede mezclarse en un rango con
  el **Negro** ($9.765). Max decía *"entre $9.765 y $9.919 según el color"*, que puede estar bien —
  es una decisión de Pablo, no un bug demostrado.
