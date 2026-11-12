// Íconos cuadrados de Workspace para celular (app instalable). Mismo dibujo que el ícono de escritorio
// (src-tauri/icons/workspace.svg) sobre un fondo de piel azul cosida, en estilo skeuomórfico.
// Uso: node scripts/mobile-icons.mjs  → public/workspace/web/icon-*.png (los que usa manifest.webmanifest).
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = await fs.readFile('src-tauri/icons/workspace.svg', 'utf8');
const defs = source.slice(source.indexOf('<defs>') + 6, source.indexOf('</defs>'));
const art = source.slice(source.indexOf('</defs>') + 7, source.lastIndexOf('</svg>'));
const out = 'public/workspace/web';

// El dibujo original no está centrado (el abanico de colores sobresale a la derecha): se recentra y se escala.
const placed = scale => `<g transform="translate(512 520) scale(${scale}) translate(-578 -512)">${art}</g>`;

const background = ({ stitch }) => `
<defs>${defs}
 <linearGradient id="mLeather" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#28509f"/><stop offset="0.55" stop-color="#173678"/><stop offset="1" stop-color="#0b1c4a"/></linearGradient>
 <radialGradient id="mGlow" cx="0.5" cy="0.38" r="0.62"><stop offset="0" stop-color="#7fb0ff" stop-opacity="0.38"/><stop offset="1" stop-color="#7fb0ff" stop-opacity="0"/></radialGradient>
 <radialGradient id="mVignette" cx="0.5" cy="0.5" r="0.72"><stop offset="0.62" stop-color="#000814" stop-opacity="0"/><stop offset="1" stop-color="#000814" stop-opacity="0.5"/></radialGradient>
 <linearGradient id="mGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
 <filter id="mGrain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise"/>
  <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/>
 </filter>
 <filter id="mPebble" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="2" seed="3" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.02  0 0 0 0 0.05  0 0 0 0 0.16  0 0 0 0.22 0"/>
 </filter>
</defs>
<rect width="1024" height="1024" fill="url(#mLeather)"/>
<rect width="1024" height="1024" filter="url(#mPebble)"/>
<rect width="1024" height="1024" filter="url(#mGrain)"/>
<rect width="1024" height="1024" fill="url(#mGlow)"/>
<rect width="1024" height="1024" fill="url(#mVignette)"/>
${stitch ? `
<rect x="58" y="58" width="908" height="908" rx="156" fill="none" stroke="#040f2e" stroke-opacity="0.45" stroke-width="16"/>
<rect x="62" y="65" width="900" height="900" rx="150" fill="none" stroke="#020a22" stroke-opacity="0.6" stroke-width="8" stroke-linecap="round" stroke-dasharray="18 16"/>
<rect x="62" y="61" width="900" height="900" rx="150" fill="none" stroke="#e4ecff" stroke-opacity="0.7" stroke-width="6" stroke-linecap="round" stroke-dasharray="18 16"/>` : ''}
<path d="M0 0 H1024 V300 Q512 380 0 300 Z" fill="url(#mGloss)"/>`;

const svg = ({ scale, stitch }) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background({ stitch })}${placed(scale)}</svg>`;

await fs.mkdir(out, { recursive: true });
// «any» e iPhone: el sistema redondea las esquinas; el dibujo ocupa el centro con margen.
const regular = svg({ scale: 0.86, stitch: true });
// Android «maskable»: puede recortarse en círculo; todo lo importante dentro del 80 % central y sin costura.
const maskable = svg({ scale: 0.7, stitch: false });
const render = (markup, size, file) => sharp(Buffer.from(markup), { density: 72 }).resize(size, size).flatten({ background: '#0b1c4a' }).png({ compressionLevel: 9 }).toFile(path.join(out, file));
await Promise.all([
  render(regular, 512, 'icon-512.png'),
  render(regular, 192, 'icon-192.png'),
  render(regular, 180, 'icon-180.png'),
  render(maskable, 512, 'icon-maskable-512.png')
]);
console.log(`Íconos de celular generados en ${out}/icon-*.png`);
