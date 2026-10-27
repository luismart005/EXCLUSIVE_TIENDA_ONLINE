# Pruebas y evidencias

## Pruebas automatizadas (RNF-22)

Se usan **node:test** y **node:assert**. Las pruebas de integración se ejecutan sobre una base de datos
**independiente** (`exclusive_test`), nunca sobre la de la demostración: el código se niega a correr si el nombre
de la base no contiene "test".

### Cómo ejecutarlas

1. Solo la primera vez (o cuando quieras empezar de cero), crea la base de pruebas:
   ```
   npm run test:db
   ```
   Crea el archivo `.env.test` (misma conexión del `.env`, base `exclusive_test`), crea la base y carga la estructura.
2. Ejecuta todas las pruebas:
   ```
   npm test
   ```
   Otras opciones: `npm run test:unit` (sin base de datos) y `npm run test:integration`.

### Qué se prueba

| Archivo | Requisitos | Casos |
|---|---|---|
| `tests/unit/money.test.js` | RNF-10 | Centavos enteros, redondeo mitad hacia arriba, porcentajes, repartos exactos |
| `tests/unit/pricing.test.js` | RF-10, RF-11, reglas 4, 10 | Mejor promoción por línea, vigencia, cupones combinables y no combinables, mínimo de compra, envío gratis, sin totales negativos, cobertura |
| `tests/unit/state-machines.test.js` | RF-21, regla 7 | Transiciones permitidas y prohibidas de pedido, pago, envío y posventa; despacho solo con pago aprobado; cancelación del cliente |
| `tests/unit/card-simulator.test.js` | RF-19 | Tarjetas de prueba aprobada/rechazada/pendiente, Luhn, solo últimos 4 dígitos |
| `tests/unit/security.test.js` | RNF-01, RNF-16, RF-31 | Permisos por rol, ocultamiento de datos sensibles en registros y bitácora, CSV sin inyección de fórmulas |
| `tests/unit/passwords.test.js` | RNF-02 | bcrypt con sal individual; el script SQL no tiene contraseñas en texto plano ni hashes repetidos |
| `tests/unit/ai-model.test.js` | RNF-23 | Las variables de la semana *t* no usan semanas futuras; estandarización; MAE |
| `tests/integration/authorization.test.js` | RNF-01, RNF-03 | Un cliente no ve pedidos ni comprobantes ajenos ni ejecuta acciones administrativas; tokens falsificados o vencidos; revocación por cierre de sesión y por desactivación de la cuenta |
| `tests/integration/inventory.test.js` | RNF-07, RNF-08, RNF-09, reglas 1, 3, 9 | Compra simultánea de la última unidad (8 solicitudes, una gana), reserva todo o nada, idempotencia de reservas y movimientos, unidades reservadas protegidas, despacho único, liberación, kardex encadenado, CHECK de la base |
| `tests/integration/sales.test.js` | RNF-08, RNF-09, RNF-10, regla 13 | Límite global y por cliente de cupones con solicitudes simultáneas, validación de cupones, compra idempotente, reembolsos con tope e idempotentes |
| `tests/integration/audit.test.js` | RNF-15, RNF-16 | La bitácora y el kardex no se pueden editar ni borrar; la bitácora descarta contraseñas y tarjetas |

Resultado esperado: **todas las pruebas pasan** (37 unitarias y 25 de integración).

## Rendimiento (RNF-11)

Con el sistema en ejecución (`npm start` es lo más parecido a producción):

```
npm run perf
```

Simula **20 usuarios concurrentes** durante 30 segundos recorriendo la tienda (inicio, categorías, búsqueda,
detalle de producto) y muestra el percentil 95 por consulta. El resultado, con el equipo, el sistema operativo, la
versión de Node.js y el volumen de datos, se guarda en `docs/evidencias/rendimiento.md`.
Opciones: `npm run perf -- --users 20 --seconds 60`.

> Si ejecutas la prueba varias veces seguidas, espera 5 minutos entre ejecuciones o sube `API_RATE_LIMIT` en `.env`,
> porque todas las solicitudes salen del mismo equipo.

## Compatibilidad (RNF-20)

Registra aquí las versiones con las que recorriste el flujo de compra y el panel (en cada navegador:
menú → Ayuda → Acerca de):

| Navegador | Versión | Tienda y compra | Panel | Observaciones |
|---|---|---|---|---|
| Google Chrome | | ☐ | ☐ | |
| Microsoft Edge | | ☐ | ☐ | |
| Mozilla Firefox | | ☐ | ☐ | |

## Diseño adaptable (RNF-19)

La compra se puede completar en **360 px** y **1366 px** de ancho; las tablas administrativas se convierten en
tarjetas apiladas en pantallas pequeñas. Para comprobarlo en Chrome: `F12` → icono de dispositivo
(*Toggle device toolbar*) → escribe 360 en el ancho.

## Recorrido de demostración sugerido

1. **Tienda sin sesión:** filtra por categoría, talla y color; abre un producto, elige color y talla, agrégalo al carrito.
2. **Compra:** en el carrito aplica `EXCLUSIVE50`; al continuar se pide iniciar sesión (`cliente@exclusive.gt` /
   `Cliente123!`) y el carrito se conserva. Elige dirección y paga con `4000 0000 0000 0002` (rechazada) y luego con
   `4242 4242 4242 4242` (aprobada). Descarga el comprobante PDF.
3. **Transferencia:** haz otra compra por transferencia y sube una imagen como comprobante; queda *En revisión*.
4. **Ventas** (`ventas@exclusive.gt` / `Ventas123!`): en **Pagos** revisa y aprueba el comprobante; en **Pedidos**
   prepara, despacha (transportista y guía), marca en tránsito y entregado. Revisa la pestaña *Trazabilidad*.
5. **Cliente:** en el pedido entregado solicita una devolución.
6. **Atención** (`atencion@exclusive.gt` / `Atencion123!`): aprueba, registra la recepción (buen estado → reintegro
   al inventario) y resuelve con reembolso parcial.
7. **Inventario** (`inventario@exclusive.gt` / `Inventario123!`): consulta el **kardex** de la variante (salida por
   venta y entrada por devolución), registra una compra a proveedor y un ajuste; intenta corregir un movimiento.
8. **Gerencia** (`gerencia@exclusive.gt` / `Gerencia123!`): revisa reportes, exporta CSV, consulta la estimación de
   IA y la bitácora de auditoría.
9. **Administrador** (`admin@exclusive.gt` / `Admin123!`): crea un usuario interno, cambia permisos de un rol,
   revisa **Sistema** (estado de los microservicios) y la documentación de la API en `/api/docs`.
10. **Buzón de pruebas** (`/buzon`): correos de confirmación, pagos, envíos y recuperación de contraseña.
