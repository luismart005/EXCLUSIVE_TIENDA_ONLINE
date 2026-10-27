import '@exclusive/common/env';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createService, env } from '@exclusive/common';
import { buildProvider } from './oidc/provider.js';
import { loadOrCreateJwks } from './oidc/keys.js';
import { startCleanup } from './oidc/adapter.js';
import { interactionRoutes } from './oidc/interactions.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes, mailboxRoutes } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await createService({
  name: 'auth-service',
  port: env.PORTS.auth,
  skipBody: (req) => req.path.startsWith('/oidc'),
  async setup(app, { logger }) {
    const jwks = await loadOrCreateJwks(logger);
    const provider = await buildProvider({ jwks, logger });

    app.use('/oidc/assets', express.static(path.resolve(__dirname, '../public'), { maxAge: '1d', fallthrough: false }));
    app.get('/favicon.svg', (req, res) => res.sendFile(path.resolve(__dirname, '../public/favicon.svg')));
    interactionRoutes(app, provider, logger);
    app.use('/oidc', provider.callback());

    app.use('/api/auth/admin', adminRoutes());
    app.use('/api/auth/mailbox', mailboxRoutes());
    app.use('/api/auth', accountRoutes());
    startCleanup(logger);
  },
});
