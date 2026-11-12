// La página de descargas (/workspace) la sirve la web de GBA.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const web = 'dist/workspace/web';
await fs.mkdir(web, { recursive: true });
await fs.cp('public/workspace', 'dist/workspace', { recursive: true });
await fs.copyFile('public/gba/workspace/workspace-icon.png', web + '/workspace-icon.png');

const worker = 'dist/workspace/notification-worker.js';
const source = await fs.readFile(worker, 'utf8');
// Sólo se admiten archivos de Vite que llevan una huella de su contenido en el nombre.
const files = await fs.readdir(web + '/assets', { withFileTypes: true });
const assets = files.filter(file => file.isFile() && /-[\w-]{8,}\.[\w]+$/.test(file.name))
  .map(file => '/workspace/web/assets/' + file.name).sort();
const version = createHash('sha256').update(source).update(JSON.stringify(assets)).digest('hex').slice(0, 16);
await fs.writeFile(worker, `self.WORKSPACE_APP_SHELL = ${JSON.stringify({ version, assets })};\n${source}`);
console.log('Archivos estáticos de Workspace copiados a dist/.');
