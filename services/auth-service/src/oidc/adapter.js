import { prisma } from '@exclusive/db';

const epoch = () => Math.floor(Date.now() / 1000);

export class PrismaOidcAdapter {
  constructor(model) {
    this.model = model;
  }

  key(id) {
    return { id_type: { id, type: this.model } };
  }

  async upsert(id, payload, expiresIn) {
    const data = {
      payload,
      grantId: payload.grantId ?? null,
      userCode: payload.userCode ?? null,
      uid: payload.uid ?? null,
      accountId: payload.accountId ? String(payload.accountId) : null,
      expiresAt: typeof expiresIn === 'number' ? new Date(Date.now() + expiresIn * 1000) : null,
    };
    await prisma.oidcPayload.upsert({ where: this.key(id), create: { id, type: this.model, ...data }, update: data });
  }

  async #findWhere(where) {
    const row = await prisma.oidcPayload.findFirst({ where: { type: this.model, ...where } });
    if (!row) return undefined;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return undefined;
    return { ...row.payload, ...(row.consumedAt ? { consumed: Math.floor(row.consumedAt.getTime() / 1000) } : {}) };
  }

  find(id) {
    return this.#findWhere({ id });
  }

  findByUid(uid) {
    return this.#findWhere({ uid });
  }

  findByUserCode(userCode) {
    return this.#findWhere({ userCode });
  }

  async consume(id) {
    await prisma.oidcPayload.updateMany({ where: { id, type: this.model }, data: { consumedAt: new Date(epoch() * 1000) } });
  }

  async destroy(id) {
    await prisma.oidcPayload.deleteMany({ where: { id, type: this.model } });
  }

  async revokeByGrantId(grantId) {
    await prisma.oidcPayload.deleteMany({ where: { grantId } });
  }
}

export async function revokeAccount(accountId) {
  const { count } = await prisma.oidcPayload.deleteMany({ where: { accountId: String(accountId) } });
  return count;
}

export function startCleanup(logger) {
  const run = async () => {
    try {
      const { count } = await prisma.oidcPayload.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      if (count) logger.info(`OIDC: ${count} registros vencidos eliminados`);
    } catch (e) {
      logger.warn('OIDC: no se pudo limpiar registros vencidos', { message: e.message });
    }
  };
  run();
  return setInterval(run, 10 * 60_000).unref();
}
