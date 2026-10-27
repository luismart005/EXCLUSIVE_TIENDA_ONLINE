import '@exclusive/common/env';
import express from 'express';
import { createService, env } from '@exclusive/common';
import { UPLOAD_DIR } from './images.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

await createService({
  name: 'catalog-service',
  port: env.PORTS.catalog,
  setup(app) {
    app.use('/uploads/products', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: false, fallthrough: false, index: false }));
    app.use('/api/catalog/admin', adminRoutes());
    app.use('/api/catalog', publicRoutes());
  },
});
