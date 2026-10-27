export const ORDER_FLOW = {
  PENDIENTE_PAGO: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['EN_PREPARACION', 'CANCELADO'],
  EN_PREPARACION: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['ENTREGADO'],
  ENTREGADO: [],
  CANCELADO: [],
};

export const PAYMENT_FLOW = {
  PENDIENTE: ['EN_REVISION', 'APROBADO', 'RECHAZADO'],
  EN_REVISION: ['APROBADO', 'RECHAZADO'],
  RECHAZADO: ['PENDIENTE', 'EN_REVISION', 'APROBADO'],
  APROBADO: ['REEMBOLSO_PARCIAL', 'REEMBOLSADO'],
  REEMBOLSO_PARCIAL: ['REEMBOLSO_PARCIAL', 'REEMBOLSADO'],
  REEMBOLSADO: [],
};

export const SHIPPING_FLOW = {
  PENDIENTE: ['PREPARANDO'],
  PREPARANDO: ['DESPACHADO'],
  DESPACHADO: ['EN_TRANSITO', 'ENTREGADO', 'INCIDENCIA'],
  EN_TRANSITO: ['ENTREGADO', 'INCIDENCIA'],
  INCIDENCIA: ['EN_TRANSITO', 'ENTREGADO', 'DEVUELTO'],
  ENTREGADO: [],
  DEVUELTO: [],
};

export const POSTSALE_FLOW = {
  SOLICITADA: ['EN_REVISION', 'APROBADA', 'RECHAZADA'],
  EN_REVISION: ['APROBADA', 'RECHAZADA'],
  APROBADA: ['PRENDA_RECIBIDA', 'RESUELTA'],
  PRENDA_RECIBIDA: ['RESUELTA'],
  RESUELTA: ['CERRADA'],
  RECHAZADA: ['CERRADA'],
  CERRADA: [],
};

export const MACHINES = { PEDIDO: ORDER_FLOW, PAGO: PAYMENT_FLOW, ENVIO: SHIPPING_FLOW, POSVENTA: POSTSALE_FLOW };

export const LABELS = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  CONFIRMADO: 'Confirmado',
  EN_PREPARACION: 'En preparación',
  ENVIADO: 'Enviado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  PENDIENTE: 'Pendiente',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  REEMBOLSO_PARCIAL: 'Reembolso parcial',
  REEMBOLSADO: 'Reembolsado',
  PREPARANDO: 'Preparando',
  DESPACHADO: 'Despachado',
  EN_TRANSITO: 'En tránsito',
  INCIDENCIA: 'Incidencia',
  DEVUELTO: 'Devuelto',
  SOLICITADA: 'Solicitada',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  PRENDA_RECIBIDA: 'Prenda recibida',
  RESUELTA: 'Resuelta',
  CERRADA: 'Cerrada',
};

export function canTransition(machine, from, to) {
  const flow = typeof machine === 'string' ? MACHINES[machine] : machine;
  if (!flow) throw new Error(`Máquina de estados desconocida: ${machine}`);
  return Array.isArray(flow[from]) && flow[from].includes(to);
}

export class TransitionError extends Error {
  constructor(kind, from, to) {
    super(`Transición no permitida (${kind}): ${LABELS[from] || from} → ${LABELS[to] || to}`);
    this.status = 409;
    this.code = 'INVALID_TRANSITION';
  }
}

export function assertTransition(kind, from, to) {
  if (!canTransition(kind, from, to)) throw new TransitionError(kind, from, to);
}

export function canDispatch(order) {
  if (order.status !== 'EN_PREPARACION') return { ok: false, reason: 'El pedido debe estar en preparación para despacharse.' };
  if (order.paymentMethod !== 'CONTRA_ENTREGA' && order.paymentStatus !== 'APROBADO')
    return { ok: false, reason: 'El pago debe estar aprobado antes del despacho (excepto contra entrega).' };
  return { ok: true };
}

export function customerCanCancel(order) {
  return ['PENDIENTE_PAGO', 'CONFIRMADO'].includes(order.status);
}
