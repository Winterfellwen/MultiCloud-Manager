import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-openclaw-ui',
      configureServer(server) {
        server.middlewares.use('/openclaw-ui/dist/', (req, res, next) => {
          const fileName = (req.url || '').split('?')[0].slice(1);
          const filePath = path.resolve(__dirname, 'openclaw-ui/dist', fileName);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', fileName.endsWith('.js') ? 'application/javascript' : 'text/plain');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
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
