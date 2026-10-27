import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { badRequest } from '@exclusive/common';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RECEIPT_DIR = path.resolve(__dirname, '../../storage/receipts');

export const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 } });

export async function saveReceipt(buffer, orderId) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(type.mime)) {
    throw badRequest('Sube el comprobante como imagen (JPG, PNG, WebP) o PDF.');
  }
  await fs.mkdir(RECEIPT_DIR, { recursive: true });
  const name = `${orderId}-${crypto.randomBytes(8).toString('hex')}`;
  if (type.mime === 'application/pdf') {
    const head = buffer.subarray(0, 1024).toString('latin1');
    if (!head.startsWith('%PDF-') || /\/JavaScript|\/JS\b|\/Launch|\/EmbeddedFile/.test(buffer.toString('latin1'))) {
      throw badRequest('El PDF contiene elementos no permitidos. Envía una captura del comprobante.');
    }
    await fs.writeFile(path.join(RECEIPT_DIR, `${name}.pdf`), buffer);
    return { file: `${name}.pdf`, mime: 'application/pdf' };
  }
  try {
    await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize(1600, 2400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(RECEIPT_DIR, `${name}.webp`));
  } catch {
    throw badRequest('La imagen del comprobante está dañada o no se puede leer.');
  }
  return { file: `${name}.webp`, mime: 'image/webp' };
}

export function receiptPath(file) {
  const safe = path.basename(String(file));
  return path.join(RECEIPT_DIR, safe);
}
