import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/users': { target: 'http://localhost:3000', changeOrigin: true },
      '/audit': { target: 'http://localhost:3000', changeOrigin: true },
      '/cloud': { target: 'http://localhost:3000', changeOrigin: true },
      '/monitor': { target: 'http://localhost:3000', changeOrigin: true },
      '/agent': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': {
        target: 'ws://localhost:3005',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
