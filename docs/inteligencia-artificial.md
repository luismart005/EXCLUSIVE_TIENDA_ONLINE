# Inteligencia artificial: estimación semanal de ventas por categoría

El módulo estima cuántas unidades podría vender cada categoría **la semana siguiente** a la última semana
completa, como apoyo para planificar el abastecimiento (RF-32 a RF-34, HU-19). Se consulta en
**Panel → Inteligencia artificial** (permiso `ai.read`); entrenar requiere `ai.train`.

> **Importante (RNF-24, regla 14).** El modelo se entrena con los datos ficticios de la demostración: sus
> métricas muestran que el método funciona, **no** la precisión comercial que tendría con ventas reales.
> El módulo solo informa; no ejecuta compras ni ajustes de inventario.

## 1. Historial semanal (RF-32)

Se prepara en la tabla `sales_weekly_history` (`services/analytics-service/src/ml/history.js`) con estas reglas:

1. Semanas de **lunes a domingo**, en hora de Guatemala; solo semanas **completas**.
2. **Unidades vendidas:** artículos de pedidos **no cancelados**, asignados a la semana en que se creó el pedido.
3. **Cancelaciones:** se guardan aparte y **no** cuentan como demanda.
4. **Devoluciones:** se restan de la semana de la venta original → `unidades netas = vendidas − devueltas`.
5. **Semanas sin existencias:** se marca cuántas variantes de la categoría se agotaron. Esas semanas se conservan
   pero **no** se usan como objetivo de entrenamiento, porque la demanda real pudo ser mayor que lo vendido
   (demanda censurada).
6. Las semanas sin ventas se registran con **cero** (no se omiten).

## 2. Variables del modelo

Para estimar la semana *t* de una categoría se usan **solo semanas anteriores** (sin información futura):

| Variable | Descripción |
|---|---|
| `lag_1` … `lag_4` | Unidades netas de las 4 semanas previas |
| `media_4` | Promedio de esas 4 semanas |
| `semana_sin`, `semana_cos` | Estacionalidad: semana del año en forma circular |
| `tendencia` | Posición de la semana dentro del historial |
| `categoria_onehot` | Categoría codificada (un modelo común para todas) |

Las variables se estandarizan con la media y desviación **del conjunto de entrenamiento**.

## 3. Algoritmo

Regresión con **red neuronal densa en TensorFlow.js**: ensamble de 5 redes (8 neuronas ReLU, regularización L2,
optimizador Adam, pérdida de error cuadrático medio y parada temprana). Una red pequeña y regularizada evita
memorizar el ruido de un historial corto; el ensamble reduce la variación entre entrenamientos.

## 4. Evaluación sin información futura (RNF-23)

1. Se reservan las **últimas 8 semanas** como período de prueba.
2. El modelo se entrena **solo** con las semanas anteriores.
3. Se mide el **error absoluto medio (MAE)** en las semanas de prueba y se compara con la referencia simple:
   el **promedio de las 4 semanas recientes** de cada categoría.
4. Se calcula el MAE general y por categoría. Si el modelo no mejora a la referencia, la pantalla lo indica.
5. Para la estimación final se reentrena con todo el historial válido.

Si una categoría tiene menos de 12 semanas con ventas, se muestra el promedio reciente y se indica que el historial
es **insuficiente** (RF-34).

## 5. Trazabilidad de cada versión (RNF-24)

Cada entrenamiento crea un registro en `ml_models` con: estado, fecha, usuario que lo solicitó, período de
entrenamiento y de prueba, variables, parámetros, MAE del modelo y de la referencia, MAE por categoría,
predicciones de prueba, tiempo de entrenamiento, pesos del ensamble y la nota sobre datos ficticios.
Las estimaciones quedan en `ml_forecasts` vinculadas a su versión. Todas las versiones se pueden consultar en la
pantalla de IA.

## 6. Aislamiento (RNF-25)

El entrenamiento corre en un **proceso aparte** (`child_process.fork` de `train-worker.js`), por lo que la tienda y
el panel siguen respondiendo mientras se entrena. Al iniciar el analytics-service, si no existe ningún modelo listo,
se entrena uno automáticamente con el historial disponible (tarda alrededor de un minuto).

## 7. Cómo leer la pantalla

- **Estimación de la próxima semana:** barras por categoría (modelo vs. promedio reciente).
- **Historial por categoría:** unidades netas semanales y, en línea punteada, la estimación.
- **Evaluación:** valores reales contra estimados en las semanas de prueba, con el MAE de ambos métodos.
- **Versiones:** cada entrenamiento con su fecha, período y métricas.
- **Entrenar de nuevo:** recalcula el historial y genera una versión nueva (las anteriores se conservan).
