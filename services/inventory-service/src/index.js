import '@exclusive/common/env';
import { createService, env } from '@exclusive/common';
import { inventoryRoutes, internalRoutes } from './routes.js';

await createService({
  name: 'inventory-service',
  port: env.PORTS.inventory,
  setup(app) {
    app.use('/internal', internalRoutes());
    app.use('/api/inventory', inventoryRoutes());
  },
});
