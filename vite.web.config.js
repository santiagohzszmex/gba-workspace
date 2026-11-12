import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { videoDevFixtures } from './scripts/video-dev-fixtures.mjs';

const webStatic = new Map([
  ['/workspace/notification-worker.js', ['public/workspace/notification-worker.js', 'text/javascript']],
  ['/workspace/notification-icon.png', ['public/workspace/notification-icon.png', 'image/png']],
  ['/workspace/web/workspace-icon.png', ['public/gba/workspace/workspace-icon.png', 'image/png']]
]);

// Los archivos del trabajador están fuera de la raíz de Vite.
function workspaceStaticDev() {
  return {
    name: 'workspace-static-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const entry = webStatic.get(req.url?.split('?')[0]);
        if (!entry || !['GET', 'HEAD'].includes(req.method)) return next();
        try {
          const [file, type] = entry;
          const data = await readFile(path.resolve(file));
          res.setHeader('Content-Type', type);
          res.setHeader('Cache-Control', 'no-store');
          res.end(req.method === 'HEAD' ? undefined : data);
        } catch (error) { next(error); }
      });
    }
  };
}

// Workspace web: se publica en gba.software/workspace/web desde su propio proyecto.
export default defineConfig({
  plugins: [react(), workspaceStaticDev(), videoDevFixtures()],
  resolve: { alias: { '/src': path.resolve('src') } },
  cacheDir: '.vite',
  define: { 'import.meta.env.VITE_GBA_ID_API_URL': JSON.stringify(process.env.VITE_GBA_ID_API_URL || 'https://gba.software/api/gba-id') },
  root: 'web',
  envDir: '..',
  base: '/workspace/web/',
  publicDir: path.resolve('public/workspace/web'),
  server: { port: 1421, strictPort: true, fs: { allow: [path.resolve('.')] } },
  build: { outDir: '../dist/workspace/web', emptyOutDir: true, target: 'safari14', rollupOptions: { input: path.resolve('web/index.html') } }
});
