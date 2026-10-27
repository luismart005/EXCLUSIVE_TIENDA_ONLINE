import { z } from 'zod';

export { z };

export const id = z.coerce.number({ message: 'Debe ser un número.' }).int().positive('Identificador inválido.');
export const money = z.coerce
  .number({ message: 'Ingresa un monto válido.' })
  .nonnegative('El monto no puede ser negativo.')
  .max(1_000_000, 'Monto fuera de rango.')
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(String(v)), 'Usa como máximo dos decimales.');
export const email = z.string({ message: 'Ingresa tu correo.' }).trim().toLowerCase().max(160).email('Ingresa un correo válido.');
export const password = z
  .string({ message: 'Ingresa una contraseña.' })
  .min(8, 'Usa al menos 8 caracteres.')
  .max(72, 'Usa como máximo 72 caracteres.')
  .regex(/[a-z]/, 'Incluye al menos una letra minúscula.')
  .regex(/[A-Z]/, 'Incluye al menos una letra mayúscula.')
  .regex(/\d/, 'Incluye al menos un número.');
export const text = (max, label = 'Este campo') => z.string({ message: `${label} es obligatorio.` }).trim().min(1, `${label} es obligatorio.`).max(max, `Máximo ${max} caracteres.`);
export const optText = (max) => z.string().trim().max(max, `Máximo ${max} caracteres.`).optional().nullable().transform((v) => (v === '' ? null : v));
export const phone = z.string().trim().regex(/^[0-9+\s-]{8,20}$/, 'Ingresa un teléfono válido (8 dígitos).');

export const parseQuery = (schema, req) => schema.parse(req.query);
export const parseBody = (schema, req) => schema.parse(req.body ?? {});
