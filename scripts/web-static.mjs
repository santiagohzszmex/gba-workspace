// Archivos estáticos de Workspace web fuera de Vite: trabajador e icono de avisos (/workspace/…)
// y el icono de la app. La página de descargas (/workspace) la sirve la web de GBA.
import fs from 'node:fs/promises';
await fs.mkdir('dist/workspace/web', { recursive: true });
await fs.cp('public/workspace', 'dist/workspace', { recursive: true });
await fs.copyFile('public/gba/workspace/workspace-icon.png', 'dist/workspace/web/workspace-icon.png');
console.log('Archivos estáticos de Workspace copiados a dist/.');
