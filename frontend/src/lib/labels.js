export const LABELS = {
  PENDIENTE_PAGO: 'Pendiente de pago', CONFIRMADO: 'Confirmado', EN_PREPARACION: 'En preparación', ENVIADO: 'Enviado', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
  PENDIENTE: 'Pendiente', EN_REVISION: 'En revisión', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado', REEMBOLSO_PARCIAL: 'Reembolso parcial', REEMBOLSADO: 'Reembolsado',
  PREPARANDO: 'Preparando', DESPACHADO: 'Despachado', EN_TRANSITO: 'En tránsito', INCIDENCIA: 'Incidencia', DEVUELTO: 'Devuelto',
  SOLICITADA: 'Solicitada', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', PRENDA_RECIBIDA: 'Prenda recibida', RESUELTA: 'Resuelta', CERRADA: 'Cerrada',
  TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', CONTRA_ENTREGA: 'Contra entrega',
  CAMBIO: 'Cambio', DEVOLUCION: 'Devolución', RECLAMO: 'Reclamo',
  ACTIVO: 'Activo', INACTIVO: 'Inactivo', BORRADOR: 'Borrador', BLOQUEADO: 'Bloqueado',
  MUJER: 'Mujer', HOMBRE: 'Hombre', UNISEX: 'Unisex',
  PORCENTAJE: 'Porcentaje', MONTO_FIJO: 'Monto fijo', ENVIO_GRATIS: 'Envío gratis', TODO: 'Toda la tienda', CATEGORIA: 'Categoría', PRODUCTO: 'Producto',
  VIGENTE: 'Vigente', PROGRAMADA: 'Programada', VENCIDA: 'Vencida', INACTIVA: 'Inactiva',
  REGISTRADA: 'Registrada', ANULADA: 'Anulada', ENTRENANDO: 'Entrenando', LISTO: 'Listo', FALLIDO: 'Fallido',
  BUENA: 'Buen estado', DANADA: 'Dañada', ENTRADA: 'Entrada', SALIDA: 'Salida',
};
export const label = (s) => LABELS[s] || s;

export const TONE = {
  ENTREGADO: 'ok', APROBADO: 'ok', RESUELTA: 'ok', CERRADA: 'neutral', ACTIVO: 'ok', VIGENTE: 'ok', LISTO: 'ok', REGISTRADA: 'ok', BUENA: 'ok',
  CONFIRMADO: 'info', EN_PREPARACION: 'info', PREPARANDO: 'info', ENVIADO: 'info', DESPACHADO: 'info', EN_TRANSITO: 'info', APROBADA: 'info', PRENDA_RECIBIDA: 'info', PROGRAMADA: 'info', ENTRENANDO: 'info',
  PENDIENTE_PAGO: 'warn', PENDIENTE: 'warn', EN_REVISION: 'warn', SOLICITADA: 'warn', REEMBOLSO_PARCIAL: 'serious', BORRADOR: 'neutral',
  INCIDENCIA: 'serious', REEMBOLSADO: 'neutral', DEVUELTO: 'serious', DANADA: 'serious',
  CANCELADO: 'bad', RECHAZADO: 'bad', RECHAZADA: 'bad', INACTIVO: 'neutral', BLOQUEADO: 'bad', VENCIDA: 'neutral', INACTIVA: 'neutral', ANULADA: 'bad', FALLIDO: 'bad',
};

export const MOVEMENT_LABELS = {
  INVENTARIO_INICIAL: 'Inventario inicial', ENTRADA_COMPRA: 'Compra a proveedor', ENTRADA_DEVOLUCION: 'Devolución de cliente', ENTRADA_AJUSTE: 'Ajuste de entrada',
  SALIDA_VENTA: 'Venta (despacho)', SALIDA_CAMBIO: 'Cambio entregado', SALIDA_DEVOLUCION_PROVEEDOR: 'Devolución a proveedor', SALIDA_DANIO: 'Daño', SALIDA_PERDIDA: 'Pérdida', SALIDA_AJUSTE: 'Ajuste de salida',
};

export const ACTION_LABELS = {
  USER_REGISTERED: 'Registro de cliente', USER_CREATED: 'Usuario creado', USER_UPDATED: 'Usuario modificado', USER_ACTIVATED: 'Usuario activado', USER_DEACTIVATED: 'Usuario desactivado',
  PASSWORD_RESET: 'Contraseña restablecida', PASSWORD_CHANGED: 'Contraseña cambiada', PROFILE_UPDATED: 'Perfil actualizado', SESSIONS_REVOKED: 'Sesiones cerradas', USER_UNLOCKED: 'Usuario desbloqueado',
  ROLE_PERMISSIONS_UPDATED: 'Permisos de rol modificados', ROLE_CREATED: 'Rol creado',
  PRODUCT_CREATED: 'Producto creado', PRODUCT_UPDATED: 'Producto modificado', PRICE_CHANGED: 'Cambio de precio', PRODUCT_ACTIVATED: 'Producto activado', PRODUCT_DEACTIVATED: 'Producto desactivado', PRODUCT_DELETED: 'Producto eliminado',
  VARIANTS_CREATED: 'Variantes creadas', VARIANT_UPDATED: 'Variante modificada', VARIANT_PRICE_CHANGED: 'Precio de variante', PRODUCT_IMAGES_UPLOADED: 'Imágenes cargadas', PRODUCT_IMAGE_DELETED: 'Imagen eliminada',
  CATEGORY_CREATED: 'Categoría creada', CATEGORY_UPDATED: 'Categoría modificada', CATEGORY_IMAGE_UPDATED: 'Imagen de categoría', COLOR_CREATED: 'Color creado', SIZE_GUIDE_UPDATED: 'Guía de tallas',
  SETTINGS_UPDATED: 'Configuración modificada', POLICY_PUBLISHED: 'Política publicada',
  PURCHASE_CREATED: 'Compra registrada', PURCHASE_VOIDED: 'Compra anulada', SUPPLIER_CREATED: 'Proveedor creado', SUPPLIER_UPDATED: 'Proveedor modificado',
  INVENTORY_ADJUSTED: 'Ajuste de inventario', INVENTORY_MOVEMENT_CREATED: 'Movimiento manual', INVENTORY_MOVEMENT_CORRECTED: 'Movimiento corregido', MIN_STOCK_UPDATED: 'Mínimo de existencias', INITIAL_STOCK_REGISTERED: 'Existencia inicial',
  STOCK_RESERVED: 'Existencias reservadas', RESERVATION_CONFIRMED: 'Reserva confirmada', RESERVATION_RELEASED: 'Reserva liberada', ORDER_STOCK_DISPATCHED: 'Salida por despacho', MOVEMENTS_EXPORTED: 'Kardex exportado',
  ORDER_CREATED: 'Pedido creado', ORDER_CANCELLED: 'Pedido cancelado', ORDER_EXPIRED: 'Pedido vencido', ORDER_PREPARING: 'Pedido en preparación', ORDER_DISPATCHED: 'Pedido despachado', ORDER_DELIVERED: 'Pedido entregado', ORDERS_EXPORTED: 'Pedidos exportados',
  PAYMENT_ATTEMPT: 'Intento de pago', PAYMENT_APPROVED: 'Pago aprobado', PAYMENT_REJECTED: 'Pago rechazado', PAYMENT_REVIEWED: 'Pago revisado', TRANSFER_RECEIPT_UPLOADED: 'Comprobante cargado', REFUND_CREATED: 'Reembolso registrado',
  SHIPMENT_INCIDENT: 'Incidencia de entrega', CARRIER_CREATED: 'Transportista creado', CARRIER_UPDATED: 'Transportista modificado', SHIPPING_ZONE_UPDATED: 'Cobertura modificada',
  POSTSALE_CREATED: 'Solicitud de posventa', POSTSALE_APPROVED: 'Posventa aprobada', POSTSALE_EN_REVISION: 'Posventa en revisión', POSTSALE_APROBADA: 'Posventa aprobada', POSTSALE_RECHAZADA: 'Posventa rechazada', POSTSALE_CERRADA: 'Posventa cerrada', POSTSALE_ITEMS_RECEIVED: 'Prendas recibidas', POSTSALE_RESOLVED: 'Posventa resuelta',
  PROMOTION_CREATED: 'Promoción creada', PROMOTION_UPDATED: 'Promoción modificada', PROMOTION_ACTIVATED: 'Promoción activada', PROMOTION_DEACTIVATED: 'Promoción desactivada',
  REPORT_EXPORTED: 'Reporte exportado', AUDIT_EXPORTED: 'Auditoría exportada', AI_HISTORY_PREPARED: 'Historial de IA preparado', AI_TRAINING_STARTED: 'Entrenamiento de IA',
};
export const actionLabel = (a) => ACTION_LABELS[a] || a;

export const DEPARTMENTS = ['Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla', 'Guatemala', 'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu', 'Sacatepéquez', 'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa'];
