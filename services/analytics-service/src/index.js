import '@exclusive/common/env';
import { createService, env } from '@exclusive/common';
import { reportRoutes } from './reports.js';
import { auditRoutes } from './audit.js';
import { mlRoutes, ensureInitialModel } from './ml/routes.js';

await createService({
  name: 'analytics-service',
  port: env.PORTS.analytics,
  setup(app) {
    app.use('/api/analytics/ai', mlRoutes());
    app.use('/api/analytics', auditRoutes());
    app.use('/api/analytics', reportRoutes());
  },
  onStart: async ({ logger }) => {
    setTimeout(() => ensureInitialModel().catch((e) => logger.warn('No se pudo entrenar el modelo inicial', { message: e.message })), 4000);
  },
});
