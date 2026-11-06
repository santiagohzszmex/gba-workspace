import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Workspace web: se publica en gba.software/workspace/web desde su propio proyecto.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '/src': path.resolve('src') } },
  cacheDir: '.vite',
  define: { 'import.meta.env.VITE_GBA_ID_API_URL': JSON.stringify(process.env.VITE_GBA_ID_API_URL || 'https://gba.software/api/gba-id') },
  root: 'web',
  envDir: '..',
  base: '/workspace/web/',
  publicDir: false,
  server: { port: 1421, strictPort: true, fs: { allow: [path.resolve('.')] } },
  build: { outDir: '../dist/workspace/web', emptyOutDir: true, target: 'safari14', rollupOptions: { input: path.resolve('web/index.html') } }
});
