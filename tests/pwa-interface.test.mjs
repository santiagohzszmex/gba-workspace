import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { workspaceInstallMode } from '../src/workspace/pwa.mjs';

const base = '/workspace/web/';
const staticFile = name => readFile(new URL('../public/workspace/web/' + name, import.meta.url));
const html = await readFile('web/index.html', 'utf8');
const vite = await readFile('vite.web.config.js', 'utf8');
const manifest = JSON.parse(await staticFile('manifest.webmanifest'));
assert.ok(vite.includes(`base: '${base}'`));
assert.ok(html.includes('rel="manifest" href="/manifest.webmanifest"'));
assert.ok(html.includes('rel="apple-touch-icon" href="/icon-180.png"'));
assert.match(vite, /publicDir: path\.resolve\('public\/workspace\/web'\)/);
assert.match(html, /viewport-fit=cover/);
assert.deepEqual([manifest.id, manifest.scope, manifest.start_url, manifest.display, manifest.lang],
  [base, base, base, 'standalone', 'es']);
assert.deepEqual(manifest.icons.map(({ sizes, purpose }) => [sizes, purpose]),
  [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]);
for (const { src, sizes } of [...manifest.icons, { src: base + 'icon-180.png', sizes: '180x180' }]) {
  assert.ok(src.startsWith(base));
  const png = await staticFile(src.slice(base.length));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, sizes);
}

assert.equal(workspaceInstallMode({ ios: false, prompt: true }), 'prompt');
assert.equal(workspaceInstallMode({ ios: true }), 'ios');
assert.equal(workspaceInstallMode({ ios: true, native: true, prompt: true }), null);
assert.equal(workspaceInstallMode({ ios: false, standalone: true, prompt: true }), null);
assert.equal(workspaceInstallMode({ ios: false }), null);

const origin = 'https://workspace.example';
const asset = base + 'assets/index-abc12345.js';
const listeners = new Map(), entries = new Map();
const cache = {
  match: async url => entries.get(url)?.clone(),
  put: async (url, response) => entries.set(url, response)
};
const deleted = [];
const calls = [];
let network = true;
const self = {
  location: { origin },
  WORKSPACE_APP_SHELL: { version: 'test', assets: [asset] },
  clients: { claim: async () => {} },
  addEventListener: (name, listener) => listeners.set(name, listener)
};
const fetch = async (request, options) => {
  calls.push([typeof request === 'string' ? request : request.url, options]);
  if (!network) throw Error('Sin red');
  const url = typeof request === 'string' ? request : request.url;
  const response = new Response(url.endsWith('.js') ? 'app nueva' : '<html>Versión actual</html>', {
    headers: { 'Content-Type': url.endsWith('.js') ? 'text/javascript' : 'text/html' }
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
};
vm.runInNewContext(await readFile('public/workspace/notification-worker.js', 'utf8'), {
  self, URL, Response, fetch, caches: {
    open: async () => cache,
    keys: async () => ['workspace-app-shell:anterior', 'workspace-app-shell:test', 'otra-app'],
    delete: async key => deleted.push(key)
  }
});
let activation;
listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
await activation;
assert.deepEqual(deleted, ['workspace-app-shell:anterior']);

function request(path, { mode = 'cors', method = 'GET', headers = {} } = {}) {
  let response;
  listeners.get('fetch')({
    request: { url: new URL(path, origin).href, mode, method, headers: new Headers(headers) },
    respondWith: value => { response = value; }
  });
  return response;
}

assert.equal(await (await request(asset)).text(), 'app nueva');
assert.equal(calls.at(-1)[1].credentials, 'omit');
assert.equal(entries.size, 1);
assert.equal(await (await request(asset)).text(), 'app nueva');
for (const path of [
  'https://project.supabase.co/rest/v1/documents', '/api/workspace-push',
  'https://workspace-originals.example.workers.dev/file', asset + '?token=privado',
  base + 'assets/nuevo-diferente.js', '/workspace/'
]) assert.equal(request(path), undefined, path);
assert.equal(request(asset, { method: 'POST' }), undefined);
assert.equal(request(asset, { headers: { Range: 'bytes=0-10' } }), undefined);

const navigate = () => request(base + '?notification=abc', { mode: 'navigate' });
assert.match(await (await navigate()).text(), /Versión actual/);
assert.equal(calls.at(-1)[1].cache, 'no-store');
network = false;
const offline = await navigate();
assert.equal(offline.status, 503);
assert.match(await offline.text(), /Sin conexión/);
assert.equal(entries.size, 1, 'el HTML y los datos privados nunca se guardan');
console.log('PASS: instalación de Workspace, iconos, actualización y caché limitada a archivos públicos.');

// El navegador de iPhone y la app agregada a inicio tienen capacidades distintas.
const { supportsDevicePush, prepareDevicePush, enableDevicePush } = await import('../src/workspace/devicePush.mjs');
const { registerWorkspaceWorker } = await import('../src/workspace/workspaceServiceWorker.mjs');
let fromTap = false, registered = 0;
const pushRegistration = {
  active: true,
  pushManager: {
    getSubscription: async () => null,
    subscribe(options) {
      assert.ok(fromTap, 'Safari necesita iniciar la suscripción dentro del toque');
      assert.deepEqual(Array.from(options.applicationServerKey), [1, 2, 3]);
      return Promise.resolve({ toJSON: () => ({ endpoint: 'https://push.example/fixture' }) });
    }
  }
};
const ios = {
  userAgent: 'iPhone',
  standalone: false,
  serviceWorker: {
    register: async (path, options) => {
      assert.equal(path, '/workspace/notification-worker.js');
      assert.equal(options.scope, '/workspace/');
      registered++;
      return pushRegistration;
    }
  }
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: ios });
Object.assign(globalThis, {
  isSecureContext: true,
  PushManager: class {},
  Notification: class {},
  localStorage: { setItem() {} },
  fetch: async (url, options) => {
    assert.equal(url, '/api/workspace-push');
    assert.equal(options.cache, 'no-store');
    return new Response(JSON.stringify({ enabled: true, publicKey: 'AQID' }));
  }
});
assert.equal(supportsDevicePush(), false);
ios.standalone = true;
assert.equal(supportsDevicePush(), true);
await registerWorkspaceWorker();
const prepared = await prepareDevicePush();
fromTap = true;
const enabled = enableDevicePush('colaborador', async (rpc, params) => {
  assert.equal(rpc, 'workspace_push_preferences');
  assert.equal(params.p_action, 'register');
  assert.equal(params.p_data.subscription.endpoint, 'https://push.example/fixture');
  return { id: 'dispositivo' };
}, prepared);
fromTap = false;
assert.equal((await enabled).id, 'dispositivo');
assert.equal(registered, 1, 'la PWA y los avisos reutilizan el mismo registro');
console.log('PASS: iPhone desde inicio, suscripción iniciada desde el toque y registro compartido.');
