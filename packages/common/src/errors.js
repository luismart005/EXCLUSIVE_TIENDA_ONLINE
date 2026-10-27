import crypto from 'node:crypto';
import { ZodError } from 'zod';
import { prisma, Prisma } from '@exclusive/db';

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.', code = 'UNAUTHORIZED') => new AppError(401, code, message);
export const forbidden = (message = 'No tienes permiso para realizar esta acción.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'No encontramos lo que buscas.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new AppError(409, 'CONFLICT', message, details);
export const unprocessable = (message, details) => new AppError(422, 'UNPROCESSABLE', message, details);

const FIELD_LABELS = {
  email: 'correo', password: 'contraseña', firstName: 'nombre', lastName: 'apellido', phone: 'teléfono',
  quantity: 'cantidad', name: 'nombre', price: 'precio', basePrice: 'precio',
};

function zodDetails(err) {
  return err.issues.map((i) => ({
    field: i.path.join('.'),
    label: FIELD_LABELS[i.path[i.path.length - 1]] || i.path.join('.'),
    message: i.message,
  }));
}

export function errorHandler(serviceName, logger) {
  return async (err, req, res, next) => {
    const requestId = req.requestId;
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Revisa los datos marcados.', details: zodDetails(err) }, requestId });
    }
    if (err instanceof AppError || (err && err.status && err.status < 500 && err.code)) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details }, requestId });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'El contenido enviado es demasiado grande.' }, requestId });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'El cuerpo de la solicitud no es JSON válido.' }, requestId });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Ya existe un registro con esos datos.' }, requestId });
      if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'El registro no existe.' }, requestId });
      if (err.code === 'P2003') return res.status(409).json({ error: { code: 'IN_USE', message: 'El registro está relacionado con otros datos y no puede eliminarse.' }, requestId });
    }
    if (err?.name === 'MulterError') {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño permitido.' : 'No se pudo procesar el archivo enviado.';
      return res.status(400).json({ error: { code: 'UPLOAD', message }, requestId });
    }
    const errorId = crypto.randomBytes(4).toString('hex').toUpperCase();
    logger.error(`Error ${errorId} en ${req.method} ${req.originalUrl}`, { errorId, requestId, message: err?.message, stack: err?.stack });
    try {
      await prisma.errorLog.create({
        data: {
          errorId, service: serviceName, method: req.method, path: req.originalUrl.slice(0, 255), status: 500,
          message: String(err?.message || err).slice(0, 2000), stack: err?.stack ? String(err.stack).slice(0, 8000) : null,
          requestId, userId: req.user?.id || null,
        },
      });
    } catch {
    }
    return res.status(500).json({
      error: { code: 'INTERNAL', message: `Ocurrió un error inesperado. Si el problema continúa, comparte este código con soporte: ${errorId}`, errorId },
      requestId,
    });
  };
}
