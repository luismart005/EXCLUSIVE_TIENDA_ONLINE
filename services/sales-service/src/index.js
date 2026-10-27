import '@exclusive/common/env';
import { createService, env } from '@exclusive/common';
import { storeRoutes } from './routes/store.js';
import { adminRoutes } from './routes/admin.js';
import { startJobs } from './jobs.js';

await createService({
  name: 'sales-service',
  port: env.PORTS.sales,
  setup(app) {
    app.use('/api/sales/admin', adminRoutes());
    app.use('/api/sales', storeRoutes());
  },
  onStart: ({ logger }) => startJobs(logger),
});
