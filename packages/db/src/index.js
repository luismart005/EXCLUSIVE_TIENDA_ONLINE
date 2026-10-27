import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let client = null;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está definida. Revisa el archivo .env en la raíz del proyecto.');
  const adapter = new PrismaPg({ connectionString: url, max: Number(process.env.DB_POOL_MAX || 10), options: '-c TimeZone=UTC' });
  const log = process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : process.env.NODE_ENV === 'test' ? ['warn'] : ['warn', 'error'];
  return new PrismaClient({ adapter, log });
}

export function getPrisma() {
  if (!client) client = create();
  return client;
}

export const prisma = new Proxy(
  {},
  {
    get(_, prop) {
      const c = getPrisma();
      const value = c[prop];
      return typeof value === 'function' ? value.bind(c) : value;
    },
  },
);

export async function disconnect() {
  if (client) await client.$disconnect();
  client = null;
}

export { Prisma };
