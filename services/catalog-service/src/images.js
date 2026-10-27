import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { badRequest } from '@exclusive/common';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '../uploads/products');
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_BYTES = 5 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 8, fields: 10 },
});

export async function processImage(buffer, prefix) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ALLOWED.has(type.mime)) throw badRequest('Formato no permitido. Sube imágenes JPG, PNG o WebP.');
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw badRequest('La imagen está dañada o no se puede leer.');
  }
  if (!meta.width || !meta.height || meta.width < 300 || meta.height < 300) throw badRequest('La imagen debe medir al menos 300 × 300 píxeles.');
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
  const base = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
  await base.clone().resize(1200, 1500, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(UPLOAD_DIR, `${name}.webp`));
  await base.clone().resize(480, 600, { fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toFile(path.join(UPLOAD_DIR, `${name}-t.webp`));
  return { url: `/uploads/products/${name}.webp`, thumbUrl: `/uploads/products/${name}-t.webp` };
}

export async function deleteImageFiles(urls) {
  for (const u of urls) {
    if (!u || !u.startsWith('/uploads/products/')) continue;
    const file = path.join(UPLOAD_DIR, path.basename(u));
    await fs.unlink(file).catch(() => {});
  }
}
