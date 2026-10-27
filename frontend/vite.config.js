import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_DEV_PORT || 5173),
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: Number(process.env.GATEWAY_PORT || 4000) },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['chart.js', 'react-chartjs-2'],
          motion: ['framer-motion'],
          auth: ['oidc-client-ts', 'react-oidc-context'],
        },
      },
    },
  },
});
