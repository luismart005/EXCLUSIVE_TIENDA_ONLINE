import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const R = [
  ['get', '/api/health', 'Sistema', 'Estado del gateway y de cada microservicio (incluye conexión a PostgreSQL)', null],
  ['get', '/api/catalog/products', 'Catálogo público', 'Listado paginado de productos activos con filtros', null, { query: ['category', 'search', 'gender', 'minPrice', 'maxPrice', 'size', 'color', 'onSale', 'inStock', 'featured', 'sort:relevancia|nuevos|precio-asc|precio-desc|nombre', 'page', 'pageSize'] }],
  ['get', '/api/catalog/products/{slug}', 'Catálogo público', 'Detalle de producto: variantes, existencias disponibles, imágenes por color y relacionados', null],
  ['get', '/api/catalog/categories', 'Catálogo público', 'Categorías activas', null],
  ['get', '/api/catalog/filters', 'Catálogo público', 'Valores disponibles para los filtros (tallas, colores, rango de precios)', null],
  ['get', '/api/catalog/variants', 'Catálogo público', 'Variantes activas de un producto (usado para cambios de talla o color)', null, { query: ['productId'] }],
  ['get', '/api/catalog/promotions/active', 'Catálogo público', 'Promociones vigentes', null],
  ['get', '/api/catalog/store', 'Catálogo público', 'Datos públicos de la tienda (contacto, horario, aviso de simulación)', null],
  ['get', '/api/catalog/policies/{slug}', 'Catálogo público', 'Versión vigente de una política (términos, privacidad, envíos, cambios)', null],
  ['get', '/api/catalog/colors', 'Catálogo público', 'Colores', null],
  ['get', '/api/catalog/sizes', 'Catálogo público', 'Tallas', null],
  ['post', '/api/auth/register', 'Cuenta', 'Registro de cliente', null, { body: { email: 'string', password: 'string', firstName: 'string', lastName: 'string', phone: 'string?', acceptTerms: 'boolean' } }],
  ['post', '/api/auth/password/forgot', 'Cuenta', 'Solicitar enlace de recuperación (respuesta idéntica exista o no la cuenta)', null, { body: { email: 'string' } }],
  ['post', '/api/auth/password/reset', 'Cuenta', 'Restablecer contraseña con el token recibido en el buzón de pruebas', null, { body: { token: 'string', password: 'string' } }],
  ['get', '/api/auth/departments', 'Cuenta', 'Departamentos de Guatemala con cobertura', null],
  ['get', '/api/auth/me', 'Cuenta', 'Perfil, roles y permisos efectivos del usuario autenticado', 'user'],
  ['put', '/api/auth/me', 'Cuenta', 'Actualizar datos personales', 'user', { body: { firstName: 'string', lastName: 'string', phone: 'string?' } }],
  ['post', '/api/auth/me/password', 'Cuenta', 'Cambiar contraseña (revoca las demás sesiones)', 'user', { body: { currentPassword: 'string', newPassword: 'string' } }],
  ['post', '/api/auth/me/logout-all', 'Cuenta', 'Cerrar sesión en todos los dispositivos', 'user'],
  ['get', '/api/auth/me/addresses', 'Cuenta', 'Direcciones de entrega', 'user'],
  ['post', '/api/auth/me/addresses', 'Cuenta', 'Agregar dirección', 'user', { body: { label: 'string', recipientName: 'string', phone: 'string', department: 'string', municipality: 'string', line1: 'string', reference: 'string?', isDefault: 'boolean?' } }],
  ['put', '/api/auth/me/addresses/{id}', 'Cuenta', 'Editar dirección', 'user'],
  ['delete', '/api/auth/me/addresses/{id}', 'Cuenta', 'Eliminar dirección', 'user'],
  ['get', '/api/auth/me/notifications', 'Cuenta', 'Notificaciones del usuario', 'user'],
  ['post', '/api/auth/me/notifications/{id}/read', 'Cuenta', 'Marcar notificación como leída', 'user'],
  ['post', '/api/auth/me/notifications/read-all', 'Cuenta', 'Marcar todas como leídas', 'user'],
  ['get', '/api/auth/mailbox', 'Buzón de pruebas', 'Correos simulados enviados por el sistema', null],
  ['get', '/api/auth/mailbox/{id}', 'Buzón de pruebas', 'Contenido de un correo simulado', null],
  ['post', '/api/sales/cart/preview', 'Carrito y compra', 'Cotizar un carrito de invitado (precios calculados en el servidor)', null, { body: { items: 'array<{variantId:int, quantity:int}>', couponCode: 'string?', department: 'string?' } }],
  ['get', '/api/sales/cart', 'Carrito y compra', 'Carrito persistente del cliente con cotización', 'user'],
  ['post', '/api/sales/cart/items', 'Carrito y compra', 'Agregar una variante al carrito', 'user', { body: { variantId: 'integer', quantity: 'integer' } }],
  ['put', '/api/sales/cart/items/{variantId}', 'Carrito y compra', 'Cambiar cantidad (0 elimina)', 'user', { body: { quantity: 'integer' } }],
  ['delete', '/api/sales/cart', 'Carrito y compra', 'Vaciar carrito', 'user'],
  ['post', '/api/sales/cart/merge', 'Carrito y compra', 'Unir el carrito de invitado al iniciar sesión', 'user', { body: { items: 'array<{variantId:int, quantity:int}>' } }],
  ['get', '/api/sales/shipping/zones', 'Carrito y compra', 'Cobertura y tarifas de envío por departamento', null],
  ['post', '/api/sales/checkout/quote', 'Carrito y compra', 'Cotización final con dirección, cupón y términos vigentes', 'user', { body: { addressId: 'integer?', couponCode: 'string?' } }],
  ['post', '/api/sales/checkout/confirm', 'Carrito y compra', 'Confirmar la compra: crea el pedido y reserva existencias (idempotente)', 'user', { idem: 'required', body: { addressId: 'integer', paymentMethod: 'enum:TARJETA|TRANSFERENCIA|CONTRA_ENTREGA', couponCode: 'string?', acceptTerms: 'boolean', termsVersion: 'integer', note: 'string?' } }],
  ['get', '/api/sales/orders', 'Mis pedidos', 'Pedidos del cliente autenticado', 'user'],
  ['get', '/api/sales/orders/{code}', 'Mis pedidos', 'Detalle del pedido: estados, pagos, envío, historial y comprobantes', 'user'],
  ['post', '/api/sales/orders/{code}/payments/card', 'Mis pedidos', 'Pago con tarjeta simulado (4242… aprobado, …0002 rechazado, …9995 pendiente)', 'user', { idem: true, body: { cardNumber: 'string', holder: 'string', expMonth: 'integer', expYear: 'integer', cvv: 'string' } }],
  ['post', '/api/sales/orders/{code}/payments/transfer', 'Mis pedidos', 'Subir comprobante de transferencia (JPG, PNG, WebP o PDF; máx. 5 MB)', 'user', { multipart: { receipt: 'binary', bankReference: 'string?' } }],
  ['post', '/api/sales/orders/{code}/cancel', 'Mis pedidos', 'Cancelar pedido antes de la preparación', 'user', { body: { reason: 'string?' } }],
  ['post', '/api/sales/orders/{code}/post-sale', 'Mis pedidos', 'Solicitar cambio, devolución o reclamo', 'user', { body: { type: 'enum:CAMBIO|DEVOLUCION|RECLAMO', reason: 'string', description: 'string', items: 'array<{orderItemId:int, quantity:int}>', desiredVariantId: 'integer?' } }],
  ['get', '/api/sales/post-sale', 'Mis pedidos', 'Solicitudes de posventa del cliente', 'user'],
  ['get', '/api/sales/payments/{id}/receipt', 'Mis pedidos', 'Ver comprobante de transferencia (solo dueño o personal autorizado)', 'user'],
  ['get', '/api/sales/documents/{number}/pdf', 'Mis pedidos', 'Comprobante de venta simulado en PDF (sin validez fiscal)', 'user'],
  ['get', '/api/sales/notifications/summary', 'Mis pedidos', 'Contadores para el encabezado', 'user'],
  ['get', '/api/sales/admin/summary', 'Pedidos y pagos', 'Colas de trabajo (pagos por revisar, por preparar, por despachar…)', 'orders.read'],
  ['get', '/api/sales/admin/orders', 'Pedidos y pagos', 'Pedidos con filtros por estado, pago, envío, fechas y búsqueda', 'orders.read', { query: ['status', 'paymentStatus', 'shippingStatus', 'method', 'from', 'to', 'search', 'queue', 'page', 'pageSize'] }],
  ['get', '/api/sales/admin/orders/export', 'Pedidos y pagos', 'Exportar pedidos a CSV', 'reports.export'],
  ['get', '/api/sales/admin/orders/{id}', 'Pedidos y pagos', 'Detalle administrativo con trazabilidad completa', 'orders.read'],
  ['post', '/api/sales/admin/orders/{id}/prepare', 'Pedidos y pagos', 'Pasar a preparación', 'orders.manage'],
  ['post', '/api/sales/admin/orders/{id}/dispatch', 'Entregas', 'Registrar despacho (descuenta existencias una sola vez)', 'shipping.manage', { body: { carrierId: 'integer', trackingNumber: 'string?' } }],
  ['post', '/api/sales/admin/orders/{id}/transit', 'Entregas', 'Marcar en tránsito', 'shipping.manage'],
  ['post', '/api/sales/admin/orders/{id}/incident', 'Entregas', 'Registrar incidencia de entrega', 'shipping.manage', { body: { description: 'string' } }],
  ['post', '/api/sales/admin/orders/{id}/deliver', 'Entregas', 'Registrar entrega (y cobro contra entrega)', 'shipping.manage'],
  ['post', '/api/sales/admin/orders/{id}/cancel', 'Pedidos y pagos', 'Cancelar pedido (libera reservas y reembolsa lo pagado)', 'orders.manage', { body: { reason: 'string' } }],
  ['post', '/api/sales/admin/orders/{id}/refunds', 'Posventa', 'Reembolso simulado con tope en lo pagado', 'refunds.create', { idem: true, body: { amount: 'number', reason: 'string', postSaleRequestId: 'integer?' } }],
  ['get', '/api/sales/admin/payments', 'Pedidos y pagos', 'Pagos y comprobantes por revisar', 'payments.review'],
  ['post', '/api/sales/admin/payments/{id}/review', 'Pedidos y pagos', 'Aprobar o rechazar una transferencia', 'payments.review', { body: { decision: 'enum:APROBAR|RECHAZAR', note: 'string?' } }],
  ['get', '/api/sales/admin/shipments', 'Entregas', 'Envíos y su estado', 'orders.read'],
  ['get', '/api/sales/admin/carriers', 'Entregas', 'Transportistas', 'orders.read'],
  ['post', '/api/sales/admin/carriers', 'Entregas', 'Crear transportista', 'shipping.config'],
  ['put', '/api/sales/admin/carriers/{id}', 'Entregas', 'Editar transportista', 'shipping.config'],
  ['put', '/api/sales/admin/shipping/zones/{id}', 'Entregas', 'Cobertura y tarifa de un departamento', 'shipping.config'],
  ['get', '/api/sales/admin/post-sale', 'Posventa', 'Solicitudes de cambio, devolución y reclamo', 'postsale.read'],
  ['get', '/api/sales/admin/post-sale/{id}', 'Posventa', 'Detalle de solicitud con historial', 'postsale.read'],
  ['post', '/api/sales/admin/post-sale/{id}/status', 'Posventa', 'Revisar, aprobar, rechazar o cerrar', 'postsale.manage', { body: { to: 'enum:EN_REVISION|APROBADA|RECHAZADA|CERRADA', note: 'string?' } }],
  ['post', '/api/sales/admin/post-sale/{id}/receive', 'Posventa', 'Registrar recepción de prendas y su condición (reintegro al inventario)', 'postsale.manage'],
  ['post', '/api/sales/admin/post-sale/{id}/resolve', 'Posventa', 'Resolver con reembolso, cambio o respuesta', 'postsale.manage'],
  ['get', '/api/sales/admin/products/{productId}/sales', 'Pedidos y pagos', 'Historial de ventas de un producto', 'orders.read'],
  ['get', '/api/sales/admin/promotions', 'Promociones', 'Promociones y cupones', 'promotions.manage'],
  ['post', '/api/sales/admin/promotions', 'Promociones', 'Crear promoción o cupón', 'promotions.manage'],
  ['put', '/api/sales/admin/promotions/{id}', 'Promociones', 'Editar promoción', 'promotions.manage'],
  ['post', '/api/sales/admin/promotions/{id}/active', 'Promociones', 'Activar o desactivar', 'promotions.manage', { body: { active: 'boolean' } }],
  ['get', '/api/catalog/admin/products', 'Catálogo (administración)', 'Productos con filtros', 'catalog.read'],
  ['post', '/api/catalog/admin/products', 'Catálogo (administración)', 'Crear producto con variantes', 'catalog.manage'],
  ['get', '/api/catalog/admin/products/{id}', 'Catálogo (administración)', 'Detalle con variantes, imágenes y auditoría', 'catalog.read'],
  ['put', '/api/catalog/admin/products/{id}', 'Catálogo (administración)', 'Editar producto', 'catalog.manage'],
  ['delete', '/api/catalog/admin/products/{id}', 'Catálogo (administración)', 'Eliminar producto sin movimientos (si tiene historial se archiva)', 'catalog.manage'],
  ['post', '/api/catalog/admin/products/{id}/status', 'Catálogo (administración)', 'Publicar, ocultar o archivar', 'catalog.manage'],
  ['post', '/api/catalog/admin/products/{id}/variants', 'Catálogo (administración)', 'Agregar variantes (talla × color)', 'catalog.manage'],
  ['put', '/api/catalog/admin/variants/{id}', 'Catálogo (administración)', 'Precio propio y activación de una variante', 'catalog.manage'],
  ['post', '/api/catalog/admin/products/{id}/images', 'Catálogo (administración)', 'Subir imágenes (validación por firma, re-codificación a WebP)', 'catalog.manage', { multipart: { images: 'binary[]', colorId: 'integer?' } }],
  ['put', '/api/catalog/admin/products/{id}/images/order', 'Catálogo (administración)', 'Reordenar imágenes', 'catalog.manage'],
  ['put', '/api/catalog/admin/images/{id}', 'Catálogo (administración)', 'Asignar color o texto alternativo a una imagen', 'catalog.manage'],
  ['delete', '/api/catalog/admin/images/{id}', 'Catálogo (administración)', 'Eliminar imagen', 'catalog.manage'],
  ['get', '/api/catalog/admin/categories', 'Catálogo (administración)', 'Categorías', 'catalog.read'],
  ['post', '/api/catalog/admin/categories', 'Catálogo (administración)', 'Crear categoría', 'catalog.manage'],
  ['put', '/api/catalog/admin/categories/{id}', 'Catálogo (administración)', 'Editar categoría', 'catalog.manage'],
  ['post', '/api/catalog/admin/categories/{id}/image', 'Catálogo (administración)', 'Imagen de categoría', 'catalog.manage'],
  ['post', '/api/catalog/admin/colors', 'Catálogo (administración)', 'Crear color', 'catalog.manage'],
  ['get', '/api/catalog/admin/size-guides', 'Catálogo (administración)', 'Guías de tallas', 'catalog.read'],
  ['put', '/api/catalog/admin/size-guides/{id}', 'Catálogo (administración)', 'Editar guía de tallas', 'catalog.manage'],
  ['get', '/api/catalog/admin/settings', 'Configuración', 'Configuración de la tienda', 'settings.manage'],
  ['put', '/api/catalog/admin/settings/{key}', 'Configuración', 'Guardar una sección de configuración', 'settings.manage'],
  ['get', '/api/catalog/admin/policies', 'Configuración', 'Políticas y sus versiones', 'settings.manage'],
  ['post', '/api/catalog/admin/policies/{slug}', 'Configuración', 'Publicar nueva versión de una política', 'settings.manage'],
  ['get', '/api/inventory/stock', 'Inventario', 'Existencias por variante (físico, reservado, disponible, mínimo)', 'inventory.read'],
  ['get', '/api/inventory/stock/summary', 'Inventario', 'Totales y alertas', 'inventory.read'],
  ['put', '/api/inventory/stock/{variantId}/min', 'Inventario', 'Existencia mínima de una variante', 'inventory.move'],
  ['get', '/api/inventory/alerts', 'Inventario', 'Variantes bajo el mínimo', 'inventory.read'],
  ['get', '/api/inventory/meta', 'Inventario', 'Tipos de movimiento disponibles', 'inventory.read'],
  ['get', '/api/inventory/movements', 'Inventario', 'Movimientos (kardex general) con filtros', 'inventory.read'],
  ['get', '/api/inventory/movements/export', 'Inventario', 'Exportar movimientos a CSV', 'reports.export'],
  ['post', '/api/inventory/movements', 'Inventario', 'Registrar entrada, salida o ajuste (idempotente)', 'inventory.move', { idem: true, body: { variantId: 'integer', type: 'enum:ENTRADA_AJUSTE|SALIDA_AJUSTE|SALIDA_DANIO|SALIDA_PERDIDA|SALIDA_DEVOLUCION_PROVEEDOR|INVENTARIO_INICIAL', quantity: 'integer', reason: 'string', documentRef: 'string?', supplierId: 'integer?', unitCost: 'number?' } }],
  ['post', '/api/inventory/movements/{id}/correct', 'Inventario', 'Corregir un movimiento con un movimiento inverso (nunca se edita)', 'inventory.move'],
  ['get', '/api/inventory/kardex/{variantId}', 'Inventario', 'Kardex de una variante con saldos', 'inventory.read'],
  ['get', '/api/inventory/products/{productId}/stock', 'Inventario', 'Existencias de un producto', 'inventory.read'],
  ['get', '/api/inventory/products/{productId}/purchases', 'Inventario', 'Historial de compras de un producto', 'inventory.read'],
  ['post', '/api/inventory/initial-stock', 'Inventario', 'Inventario inicial de variantes nuevas', 'inventory.move'],
  ['get', '/api/inventory/purchases', 'Compras a proveedores', 'Compras registradas', 'inventory.read'],
  ['post', '/api/inventory/purchases', 'Compras a proveedores', 'Registrar compra (genera entradas al kardex)', 'suppliers.manage', { idem: true }],
  ['get', '/api/inventory/purchases/{id}', 'Compras a proveedores', 'Detalle de compra', 'inventory.read'],
  ['post', '/api/inventory/purchases/{id}/void', 'Compras a proveedores', 'Anular compra con movimientos inversos', 'suppliers.manage'],
  ['get', '/api/inventory/suppliers', 'Compras a proveedores', 'Proveedores', 'inventory.read'],
  ['post', '/api/inventory/suppliers', 'Compras a proveedores', 'Crear proveedor', 'suppliers.manage'],
  ['put', '/api/inventory/suppliers/{id}', 'Compras a proveedores', 'Editar proveedor', 'suppliers.manage'],
  ['get', '/api/analytics/dashboard', 'Reportes', 'Indicadores del panel con comparación contra el período anterior', 'dashboard.view', { query: ['from', 'to'] }],
  ['get', '/api/analytics/reports/sales', 'Reportes', 'Ventas por día, semana o mes', 'reports.read', { query: ['from', 'to', 'group', 'format:json|csv'] }],
  ['get', '/api/analytics/reports/products', 'Reportes', 'Productos más y menos vendidos', 'reports.read'],
  ['get', '/api/analytics/reports/dimensions', 'Reportes', 'Ventas por categoría, talla, color, departamento y método de pago', 'reports.read'],
  ['get', '/api/analytics/reports/discounts', 'Reportes', 'Efecto de promociones y cupones', 'reports.read'],
  ['get', '/api/analytics/reports/returns', 'Reportes', 'Cambios, devoluciones y reembolsos', 'reports.read'],
  ['get', '/api/analytics/reports/inventory', 'Reportes', 'Rotación, valor del inventario y existencias críticas', 'reports.read'],
  ['get', '/api/analytics/audit', 'Auditoría', 'Bitácora inmutable con filtros', 'audit.read'],
  ['get', '/api/analytics/audit/meta', 'Auditoría', 'Servicios, acciones y entidades registradas', 'audit.read'],
  ['get', '/api/analytics/audit/export', 'Auditoría', 'Exportar bitácora a CSV', 'audit.read'],
  ['get', '/api/analytics/errors', 'Auditoría', 'Errores técnicos por identificador', 'audit.read'],
  ['get', '/api/analytics/ai/history', 'Inteligencia artificial', 'Historial semanal por categoría usado por el modelo', 'ai.read'],
  ['post', '/api/analytics/ai/history/refresh', 'Inteligencia artificial', 'Recalcular historial semanal', 'ai.train'],
  ['post', '/api/analytics/ai/train', 'Inteligencia artificial', 'Entrenar y evaluar una nueva versión (proceso aparte)', 'ai.train'],
  ['get', '/api/analytics/ai/models', 'Inteligencia artificial', 'Versiones del modelo con período, variables y métricas', 'ai.read'],
  ['get', '/api/analytics/ai/models/{id}', 'Inteligencia artificial', 'Detalle de una versión (MAE por categoría, parámetros)', 'ai.read'],
  ['get', '/api/analytics/ai/forecast', 'Inteligencia artificial', 'Estimación de unidades de la siguiente semana por categoría', 'ai.read'],
  ['get', '/api/auth/admin/users', 'Usuarios y roles', 'Usuarios con filtros', 'users.read'],
  ['post', '/api/auth/admin/users', 'Usuarios y roles', 'Crear usuario interno con contraseña temporal', 'users.manage'],
  ['get', '/api/auth/admin/users/{id}', 'Usuarios y roles', 'Detalle con roles, eventos de seguridad y auditoría', 'users.read'],
  ['put', '/api/auth/admin/users/{id}', 'Usuarios y roles', 'Editar usuario y roles', 'users.manage'],
  ['post', '/api/auth/admin/users/{id}/status', 'Usuarios y roles', 'Activar o desactivar (revoca sesiones)', 'users.manage'],
  ['post', '/api/auth/admin/users/{id}/unlock', 'Usuarios y roles', 'Desbloquear tras intentos fallidos', 'users.manage'],
  ['post', '/api/auth/admin/users/{id}/revoke-sessions', 'Usuarios y roles', 'Cerrar todas las sesiones del usuario', 'users.manage'],
  ['get', '/api/auth/admin/roles', 'Usuarios y roles', 'Roles con sus permisos', 'roles.manage'],
  ['post', '/api/auth/admin/roles', 'Usuarios y roles', 'Crear rol', 'roles.manage'],
  ['put', '/api/auth/admin/roles/{id}/permissions', 'Usuarios y roles', 'Asignar permisos a un rol', 'roles.manage'],
  ['get', '/api/auth/admin/permissions', 'Usuarios y roles', 'Catálogo de permisos', 'roles.manage'],
  ['get', '/api/auth/admin/security-events', 'Auditoría', 'Eventos de seguridad (inicios de sesión, bloqueos, recuperaciones)', 'audit.read'],
];

const typeOf = (t) => {
  const opt = t.endsWith('?');
  const base = t.replace(/\?$/, '');
  if (base.startsWith('enum:')) return [{ type: 'string', enum: base.slice(5).split('|') }, opt];
  if (base.startsWith('array<')) {
    const inner = base.slice(6, -1).replace(/[{}]/g, '').split(',').map((s) => s.trim().split(':'));
    return [{ type: 'array', items: { type: 'object', properties: Object.fromEntries(inner.map(([k, v]) => [k, { type: v === 'int' ? 'integer' : v }])) } }, opt];
  }
  if (base === 'binary') return [{ type: 'string', format: 'binary' }, opt];
  if (base === 'binary[]') return [{ type: 'array', items: { type: 'string', format: 'binary' } }, opt];
  return [{ type: base }, opt];
};
const objectSchema = (body) => {
  const properties = {};
  const required = [];
  for (const [k, t] of Object.entries(body)) {
    const [schema, opt] = typeOf(t);
    properties[k] = schema;
    if (!opt) required.push(k);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
};

const paths = {};
for (const [method, p, tag, summary, auth, extra = {}] of R) {
  const params = [...p.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: ['slug', 'code', 'number', 'key'].includes(m[1]) ? 'string' : 'integer' } }));
  for (const q of extra.query || []) {
    const [name, en] = q.split(':');
    params.push({ name, in: 'query', required: false, schema: en ? { type: 'string', enum: en.split('|') } : { type: ['page', 'pageSize', 'productId'].includes(name) ? 'integer' : 'string' } });
  }
  if (extra.idem) params.push({ $ref: extra.idem === 'required' ? '#/components/parameters/IdempotencyKeyRequired' : '#/components/parameters/IdempotencyKey' });
  const op = {
    tags: [tag],
    summary,
    ...(auth === 'user' ? { description: 'Requiere sesión iniciada (cualquier rol).' } : auth ? { description: `Requiere el permiso \`${auth}\`.` } : { description: 'Público.' }),
    ...(params.length ? { parameters: params } : {}),
    ...(auth ? { security: [{ bearerAuth: [] }] } : { security: [] }),
    responses: {
      200: { description: 'Correcto', content: { 'application/json': { schema: { type: 'object' } } } },
      ...(auth ? { 401: { $ref: '#/components/responses/Unauthorized' }, 403: { $ref: '#/components/responses/Forbidden' } } : {}),
      ...(['post', 'put'].includes(method) ? { 400: { $ref: '#/components/responses/BadRequest' }, 409: { $ref: '#/components/responses/Conflict' } } : {}),
      ...(p.includes('{') ? { 404: { $ref: '#/components/responses/NotFound' } } : {}),
    },
  };
  if (extra.body) op.requestBody = { required: true, content: { 'application/json': { schema: objectSchema(extra.body) } } };
  if (extra.multipart) op.requestBody = { required: true, content: { 'multipart/form-data': { schema: objectSchema(extra.multipart) } } };
  paths[p] = paths[p] || {};
  paths[p][method] = op;
}

const errorRef = (d) => ({ description: d, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Exclusive — API de comercio electrónico',
    version: '1.0.0',
    description: [
      'API del sistema web de comercio electrónico y gestión de ventas de ropa **Exclusive** (proyecto académico, Universidad Mariano Gálvez de Guatemala).',
      '',
      'Todas las rutas pasan por el **API Gateway** (`:4000`), que las enruta a cinco microservicios: auth, catalog, inventory, sales y analytics.',
      '',
      '**Seguridad:** OAuth 2.0 + OpenID Connect (Authorization Code con PKCE). El proveedor está en `/oidc` y su configuración en `/oidc/.well-known/openid-configuration`. Las rutas protegidas reciben un token de acceso JWT (RS256) en `Authorization: Bearer <token>`; cada servicio lo valida con las llaves públicas (JWKS) y comprueba los permisos del rol en la base de datos.',
      '',
      'Para probar desde esta página: inicia sesión en el sistema, abre las herramientas de desarrollador (F12) → Application (Aplicación) → Session Storage → `http://localhost:4000`, abre la clave que empieza con `oidc.user:`, copia el valor del campo `access_token` y pégalo en **Authorize**.',
      '',
      '**Montos:** decimales en quetzales (GTQ) como texto (`"129.00"`). **Pagos, facturación y envíos simulados — sin validez fiscal.**',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Gateway actual' }, { url: 'http://localhost:4000', description: 'Local' }],
  tags: [...new Set(R.map((r) => r[2]))].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token de acceso emitido por el proveedor OIDC (audiencia urn:exclusive:api).' },
      oidc: { type: 'openIdConnect', openIdConnectUrl: '/oidc/.well-known/openid-configuration' },
    },
    parameters: {
      IdempotencyKeyRequired: { name: 'Idempotency-Key', in: 'header', required: true, description: 'Llave única de la compra (UUID). Repetir la confirmación con la misma llave devuelve el mismo pedido (RNF-09).', schema: { type: 'string', minLength: 8, maxLength: 80 } },
      IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: false, description: 'Llave única por operación (UUID). Repetir la solicitud con la misma llave devuelve el mismo resultado sin duplicar la operación (RNF-09).', schema: { type: 'string', minLength: 8, maxLength: 80 } },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'CONFLICT' },
              message: { type: 'string', example: 'Algunos productos ya no tienen existencias suficientes.' },
              details: { description: 'Errores por campo (validación) o datos adicionales' },
              errorId: { type: 'string', description: 'Solo en errores 500: identificador para localizar el fallo en Auditoría → Errores técnicos (RNF-17)', example: '9F3A2C1B' },
            },
          },
          requestId: { type: 'string', description: 'Identificador de la solicitud (trazabilidad entre servicios)' },
        },
      },
    },
    responses: {
      BadRequest: errorRef('Datos inválidos (validación del servidor)'),
      Unauthorized: errorRef('Sin sesión o token vencido/revocado'),
      Forbidden: errorRef('El rol no tiene el permiso requerido'),
      NotFound: errorRef('No existe o no pertenece al usuario'),
      Conflict: errorRef('Regla de negocio: existencias, transición de estado no permitida, límite de cupón…'),
    },
  },
};
fs.writeFileSync(path.join(ROOT, 'docs/openapi.yaml'), YAML.stringify(spec, { lineWidth: 0 }));
console.log(`docs/openapi.yaml generado: ${R.length} operaciones en ${Object.keys(paths).length} rutas`);
