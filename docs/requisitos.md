# Trazabilidad de requisitos

Dónde se cumple cada requisito del documento de definición. Las rutas de pantalla son relativas a
`http://localhost:4000`; los endpoints están documentados en `/api/docs`.

## Requerimientos funcionales

| ID | Requerimiento | Pantalla | Servicio / endpoint |
|---|---|---|---|
| RF-01 | Registro y datos de cuenta | `/registro`, `/cuenta/perfil` | auth · `POST /api/auth/register`, `PUT /api/auth/me` |
| RF-02 | Inicio/cierre de sesión, recuperación, invalidación | Página de inicio de sesión (OIDC), `/recuperar`, `/restablecer`, menú → Cerrar sesión, Perfil → Cerrar sesión en todos los dispositivos | auth · `/oidc/*`, `/api/auth/password/*`, `/api/auth/me/logout-all` |
| RF-03 | Roles, permisos y activación de cuentas | `/admin/usuarios`, `/admin/roles` | auth · `/api/auth/admin/*` |
| RF-04 | Productos, categorías, fotos, descripciones, guías de tallas | `/admin/productos`, `/admin/categorias` | catalog · `/api/catalog/admin/*` |
| RF-05 | Variantes talla × color con SKU único | Producto → pestaña Variantes | catalog · `POST /api/catalog/admin/products/{id}/variants` (SKU único en BD) |
| RF-06 | Buscar, filtrar y paginar | `/tienda`, buscador del encabezado | catalog · `GET /api/catalog/products` |
| RF-07 | Carrito persistente | `/carrito` (se une al iniciar sesión) | sales · `/api/sales/cart*` |
| RF-08 | Direcciones con departamento, municipio, referencia, teléfono | `/cuenta/direcciones`, checkout | auth · `/api/auth/me/addresses` |
| RF-09 | Cobertura y tarifas | `/admin/configuracion` → Cobertura | sales · `PUT /api/sales/admin/shipping/zones/{id}` |
| RF-10 | Promociones y cupones con límites | `/admin/promociones` | sales · `/api/sales/admin/promotions` |
| RF-11 | Cálculo en el servidor | Carrito y checkout | `packages/common/src/pricing.js`, `POST /api/sales/checkout/quote` |
| RF-12 | Pedido con copia de productos, precios, descuentos y dirección | Detalle del pedido | `order_items`, `orders.address_snapshot`, `orders.pricing_snapshot` |
| RF-13 | Reservar al confirmar, liberar al vencer o cancelar | Pedido → Trazabilidad → Reservas | inventory · `/internal/reservations/*`; trabajo programado del sales-service |
| RF-14 | Inventario inicial y compras a proveedores | `/admin/compras/nueva`, `/admin/proveedores` | inventory · `/api/inventory/purchases`, `/initial-stock` |
| RF-15 | Salidas por despacho, devolución a proveedor, daño, pérdida | `/admin/inventario` → Registrar movimiento; despacho del pedido | inventory · `POST /api/inventory/movements` |
| RF-16 | Ajustes justificados y correcciones compensatorias | Kardex → Corregir | inventory · `POST /api/inventory/movements/{id}/correct` |
| RF-17 | Kardex con físico, reservado y disponible | `/admin/kardex`, `/admin/inventario` | inventory · `/api/inventory/kardex/{variantId}` |
| RF-18 | Alertas de existencias bajas por variante | `/admin/inventario` (mínimo editable), notificaciones | inventory · `PUT /api/inventory/stock/{variantId}/min`, `/alerts` |
| RF-19 | Pagos simulados aprobados, rechazados y pendientes | Pedido → Pagar con tarjeta | sales · `POST /api/sales/orders/{code}/payments/card` |
| RF-20 | Comprobantes de transferencia y contra entrega | Pedido → Transferencia; `/admin/pagos` | sales · `/payments/transfer`, `/admin/payments/{id}/review` |
| RF-21 | Estados separados con historial | Pedido → Trazabilidad → Estados | `order_status_history`, `stateMachines.js` |
| RF-22 | Documentos de demostración sin validez fiscal | Pedido → Comprobante PDF | sales · `GET /api/sales/documents/{number}/pdf` |
| RF-23 | Transportista, guía, despacho, entrega e incidencias | `/admin/pedidos/{id}`, `/admin/envios` | sales · `/admin/orders/{id}/dispatch|transit|incident|deliver` |
| RF-24 | Cambios, devoluciones y reclamos | Pedido → ¿Algo no salió bien?; `/cuenta/posventa`; `/admin/posventa` | sales · `/orders/{code}/post-sale`, `/admin/post-sale/*` |
| RF-25 | Recepción y revisión antes del reintegro | Posventa → Recibir prendas | sales · `/admin/post-sale/{id}/receive`; inventory · `/internal/returns` |
| RF-26 | Reembolsos vinculados al pago y con tope | Posventa → Resolver; Pedido → Reembolso | sales · `createRefund` |
| RF-27 | Notificaciones y buzón local | Campana de notificaciones, `/cuenta/notificaciones`, `/buzon` | `notifications`, `mailbox_messages` |
| RF-28 | Datos de la tienda, políticas y versión aceptada | Pie de página, `/politicas/{slug}`, `/admin/configuracion` | catalog · políticas versionadas; `orders.terms_version` |
| RF-29 | Reportes por período | `/admin/reportes` → Ventas, Descuentos, Devoluciones | analytics · `/api/analytics/reports/*` |
| RF-30 | Más vendidos, por categoría/talla/color, poca rotación | `/admin/reportes` → Productos, Dimensiones | analytics · `/reports/products`, `/reports/dimensions` |
| RF-31 | Exportar CSV según permisos | Botones "CSV" (permiso `reports.export`) | `sendCSV` + auditoría `REPORT_EXPORTED` |
| RF-32 | Historial semanal con reglas documentadas | `/admin/ia` | analytics · `ml/history.js` ([IA](inteligencia-artificial.md)) |
| RF-33 | Modelo de regresión semanal por categoría | `/admin/ia` → Entrenar | analytics · `ml/train-worker.js` (TensorFlow.js) |
| RF-34 | Estimaciones, fecha, evaluación e historial insuficiente | `/admin/ia` | analytics · `/api/analytics/ai/forecast`, `/models` |
| RF-35 | Auditoría de cambios sensibles | `/admin/auditoria`; pestañas Auditoría en producto, usuario y pedido | `audit()` en cada servicio |
| RF-36 | Consultar y filtrar sin editar | `/admin/auditoria` | analytics · `GET /api/analytics/audit` + trigger de inmutabilidad |
| RF-37 | Errores técnicos y eventos de seguridad | Auditoría → Errores técnicos / Eventos de seguridad | `error_logs`, `security_events`, `logs/*.log` |

## Historias de usuario

| ID | Dónde se demuestra |
|---|---|
| HU-01 | `/registro` (correo único) y pedidos visibles solo para su dueño (`authorization.test.js`) |
| HU-02 | `/recuperar` → correo en `/buzon` → `/restablecer`; el enlace vence en 30 min y se usa una vez |
| HU-03 | `/tienda`: filtros de categoría, talla, color, precio, ofertas y orden |
| HU-04 | Detalle de producto: fotos por color, guía de tallas, disponibilidad por combinación |
| HU-05 | `/carrito`: cambiar cantidades; el carrito se guarda en la cuenta |
| HU-06 | Cupón en carrito/checkout: vigencia, mínimo, límites y ahorro mostrado |
| HU-07 | Checkout: artículos, descuentos, envío, total; destinos sin cobertura rechazados |
| HU-08 | Pago con tarjeta simulada, transferencia o contra entrega; aviso de simulación |
| HU-09 | `/cuenta/pedidos` y detalle con historial y comprobantes |
| HU-10 | Detalle del pedido → solicitud de posventa; seguimiento en `/cuenta/posventa` |
| HU-11 | `/admin/productos`: crear, editar, desactivar sin perder historial |
| HU-12 | `/admin/inventario` → Registrar movimiento (cantidad, motivo, responsable, referencia) |
| HU-13 | `/admin/kardex`: filtros y saldos antes/después |
| HU-14 | `/admin/promociones`: alcance, vigencia, límites, combinación |
| HU-15 | `/admin/pagos`: el comprobante queda en revisión hasta decidir |
| HU-16 | `/admin/pedidos/{id}`: guía, estados y salida de inventario única |
| HU-17 | `/admin/posventa/{id}`: recepción, decisión y reembolso separados |
| HU-18 | `/admin/reportes`: filtros de fecha; distingue cobros, cancelaciones y devoluciones |
| HU-19 | `/admin/ia`: categoría, semana estimada, fecha del modelo y error de evaluación |
| HU-20 | `/admin/auditoria` y `/admin/roles` solo para usuarios autorizados |

## Requerimientos no funcionales

| ID | Evidencia |
|---|---|
| RNF-01 Autorización | Permisos por ruta y propiedad de datos · `tests/integration/authorization.test.js` |
| RNF-02 Contraseñas | bcrypt con sal individual · `tests/unit/passwords.test.js` |
| RNF-03 Sesiones | Tokens de 15 min, refresh rotativo, `sessionVersion` · `authorization.test.js` |
| RNF-04 Protección de acceso | Límites de intentos, bloqueo temporal, mensajes genéricos ([seguridad](seguridad.md#protección-del-acceso-rnf-04)) |
| RNF-05 Validación y archivos | zod, firma de archivos, re-codificación, PDF sin scripts, CSV seguro ([seguridad](seguridad.md#validación-de-entradas-y-archivos-rnf-05)) |
| RNF-06 Comunicación | HTTP local con datos ficticios; guía de HTTPS ([seguridad](seguridad.md#despliegue-comercial-rnf-06)) |
| RNF-07 Integridad | Transacciones y saga con compensación · `inventory.test.js` |
| RNF-08 Concurrencia | Última unidad y límites de cupones · `inventory.test.js`, `sales.test.js` |
| RNF-09 Idempotencia | Llaves de idempotencia · `inventory.test.js`, `sales.test.js` |
| RNF-10 Exactitud monetaria | Centavos enteros y redondeo documentado ([reglas](reglas-de-negocio.md#dinero-rnf-10)) · `money.test.js` |
| RNF-11 Rendimiento | `npm run perf` → `docs/evidencias/rendimiento.md` |
| RNF-12 Persistencia | Todo en PostgreSQL; reiniciar servicios o el equipo no pierde datos |
| RNF-13 Respaldos | `npm run backup` (base + imágenes + comprobantes) ([respaldos](respaldos.md)) |
| RNF-14 Recuperación | `npm run restore` con comprobación automática ([respaldos](respaldos.md#prueba-de-recuperación-en-una-instalación-limpia-rnf-14)) |
| RNF-15 Auditoría | Trigger de inmutabilidad, `database/permisos-produccion.sql` · `audit.test.js` |
| RNF-16 Privacidad | Comprobantes privados, registros sin datos sensibles · `security.test.js` |
| RNF-17 Manejo de errores | Mensajes sin detalles internos e identificador `errorId` |
| RNF-18 Usabilidad y accesibilidad | Etiquetas y errores por campo, navegación con teclado, foco visible, estados con texto e icono (no solo color) |
| RNF-19 Diseño adaptable | Compra completa en 360 px y 1366 px; tablas apiladas en móvil |
| RNF-20 Compatibilidad | Tabla de versiones en [pruebas](pruebas.md#compatibilidad-rnf-20) |
| RNF-21 Mantenimiento | Módulos por servicio, `npm run check`, README de instalación |
| RNF-22 Pruebas | `npm test` sobre `exclusive_test` ([pruebas](pruebas.md)) |
| RNF-23 Evaluación de IA | Últimas 8 semanas como prueba, MAE vs. promedio reciente · `ai-model.test.js` |
| RNF-24 Trazabilidad de IA | Versiones en `ml_models` con período, variables, fecha y métricas |
| RNF-25 Aislamiento de tareas | Entrenamiento en proceso aparte (`child_process.fork`) |
| RNF-26 Observabilidad | `/health` por servicio, `/api/health`, pantalla Sistema |
| RNF-27 Separación de ambientes | `.env` / `.env.test` / producción; credenciales fuera del repositorio |
