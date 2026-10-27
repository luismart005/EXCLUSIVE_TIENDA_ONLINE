import { prisma } from '@exclusive/db';
import { cancelOrder, inventory } from './lib/orders.js';

let running = false;

export function startJobs(logger) {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const expired = await prisma.order.findMany({
        where: { status: 'PENDIENTE_PAGO', reservationExpiresAt: { lt: new Date() }, paymentStatus: { in: ['PENDIENTE', 'RECHAZADO'] } },
        select: { id: true, code: true },
        take: 50,
      });
      for (const o of expired) {
        try {
          await cancelOrder(null, o.id, { user: null, reason: 'Reserva vencida: no se completó el pago a tiempo', system: true });
          logger.info(`Pedido ${o.code} cancelado por vencimiento de reserva`);
        } catch (e) {
          logger.warn(`No se pudo cancelar ${o.code}`, { message: e.message });
        }
      }
      const stale = await prisma.reservation.findMany({
        where: { status: { in: ['ACTIVA', 'CONFIRMADA'] }, order: { status: 'CANCELADO' } },
        select: { orderId: true }, distinct: ['orderId'], take: 50,
      });
      for (const s of stale) await inventory.post(`/internal/reservations/${s.orderId}/release`, { reason: 'Reconciliación: pedido cancelado' }).catch(() => {});
      const unconfirmed = await prisma.reservation.findMany({
        where: { status: 'ACTIVA', order: { status: { in: ['CONFIRMADO', 'EN_PREPARACION'] } } },
        select: { orderId: true }, distinct: ['orderId'], take: 50,
      });
      for (const s of unconfirmed) await inventory.post(`/internal/reservations/${s.orderId}/confirm`, {}).catch(() => {});
    } catch (e) {
      logger.warn('Error en la tarea de reservas', { message: e.message });
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5000);
  return setInterval(tick, 60_000).unref();
}
