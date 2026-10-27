import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK } from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = path.resolve(__dirname, '../../keys');
const FILE = path.join(KEYS_DIR, 'jwks.json');

export async function loadOrCreateJwks(logger) {
  if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = crypto.randomUUID();
  jwk.use = 'sig';
  jwk.alg = 'RS256';
  const jwks = { keys: [jwk] };
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(jwks, null, 2), { mode: 0o600 });
  logger.info('Se generó un nuevo par de llaves RS256 para firmar tokens');
  return jwks;
}
