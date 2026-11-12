import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP) {
  throw Error('Esta prueba sólo corre en un runner desechable de Windows.');
}
const releases = 'https://github.com/santiagohzszmex/GBA-VISTA-seeitdifferently/releases/download/';
const priorVersion = '1.6.603';
const nextVersion = '1.8.0';
const stagedTarget = 'windows-labradorita-beta';
const port = 19431;
const folder = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP, 'workspace-labradorita-'));
const installDir = path.join(folder, 'app');
const installer = path.join(folder, 'bridge.exe');
const executable = path.join(installDir, 'gba-workspace.exe');
const sentinelKey = 'workspace-upgrade-fixture';

async function readRelease(relative) {
  const response = await fetch(releases + relative, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw Error(`No se pudo descargar ${relative}: HTTP ${response.status}`);
  return response;
}

async function eventually(check, timeout, message) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const value = await check(); if (value) return value; }
    catch (error) { last = error; }
    await wait(500);
  }
  throw Error(message, { cause: last });
}

function launch() {
  return spawn(executable, [], { stdio: 'ignore', env: {
    ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`
  } });
}

async function connection() {
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }).then(response => response.json());
  const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl && /^(https?:\/\/tauri\.localhost|tauri:\/\/localhost)/.test(item.url));
  if (!page) return;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const callbacks = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const callback = callbacks.get(message.id);
    if (callback) { callbacks.delete(message.id); callback(message); }
  };
  return {
    close: () => ws.close(),
    evaluate(expression, timeout = 15000) {
      return new Promise((resolve, reject) => {
        const current = ++id;
        const timer = setTimeout(() => { callbacks.delete(current); reject(Error('El comando de prueba no respondió.')); }, timeout);
        callbacks.set(current, message => {
          clearTimeout(timer);
          const exception = message.result?.exceptionDetails;
          if (message.error || exception) reject(Error(exception?.exception?.description ?? exception?.exception?.value ?? exception?.text ?? message.error.message));
          else resolve(message.result.result.value);
        });
        ws.send(JSON.stringify({ id: current, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
      });
    }
  };
}

async function findVersion(expected) {
  const cdp = await connection();
  if (!cdp) return;
  try {
    const version = await cdp.evaluate("window.__TAURI_INTERNALS__?.invoke('plugin:app|version')", 4000);
    if (version === expected) return cdp;
    cdp.close();
  } catch (error) { cdp.close(); throw error; }
}

const priorName = 'gba-workspace-1.6.6.3-windows-x86_64.exe';
const priorFolder = 'workspace-v1.6.6.3-beta.1/';
const priorMetadata = await readRelease(priorFolder + 'packages.json').then(response => response.json());
const known = [...(priorMetadata.downloads ?? []), ...(priorMetadata.updaters ?? []), ...(priorMetadata.artifacts ?? [])].find(entry => entry.file === priorName);
assert.match(known?.sha256 ?? '', /^[a-f0-9]{64}$/, 'No se pudo identificar la huella del instalador puente.');
const bytes = Buffer.from(await readRelease(priorFolder + priorName).then(response => response.arrayBuffer()));
assert.equal(createHash('sha256').update(bytes).digest('hex'), known.sha256);
await fs.writeFile(installer, bytes);
execFileSync(installer, ['/S', `/D=${installDir}`], { timeout: 120000, stdio: 'pipe' });
const old = launch();
old.on('error', error => { console.error(error.message); });
let current;
try {
  current = await eventually(() => findVersion(priorVersion), 45000, 'No se pudo abrir el instalador público de Workspace 1.6.6.3.');
  const found = await current.evaluate(`(async () => {
    localStorage.setItem(${JSON.stringify(sentinelKey)}, 'conservado');
    return window.__TAURI_INTERNALS__.invoke('plugin:updater|check', { target: ${JSON.stringify(stagedTarget)}, timeout: 30000 });
  })()`, 40000);
  assert.equal(found?.currentVersion, priorVersion);
  assert.equal(found?.version, nextVersion);
  console.log('Cuarzo detectó la beta firmada en el canal aislado de prueba.');
  const result = await current.evaluate(`(async () => {
    const api = window.__TAURI_INTERNALS__;
    const events = [];
    const callback = api.transformCallback(event => { if (event?.message?.event) events.push(event.message.event); });
    const rid = await api.invoke('plugin:updater|download', { rid: ${Number(found.rid)}, onEvent: '__CHANNEL__:' + callback, timeout: 90000 });
    return { rid, events };
  })()`, 105000);
  assert.ok(Number.isInteger(result?.rid), 'El actualizador no descargó ni verificó la firma.');
  console.log('El actualizador nativo descargó y verificó la firma de Labradorita.');
  await current.evaluate(`(() => {
    setTimeout(() => { window.__TAURI_INTERNALS__.invoke('plugin:updater|install', { updateRid: ${Number(found.rid)}, bytesRid: ${Number(result.rid)} }).catch(error => { window.__workspaceUpdateError = String(error); }); }, 250);
    return true;
  })()`);
  let updated;
  try {
    updated = await eventually(() => findVersion(nextVersion), 120000, 'Labradorita no reinició después de actualizar.');
  } catch (error) {
    const reason = await current.evaluate('window.__workspaceUpdateError', 2000).catch(() => null);
    if (reason) throw Error(reason, { cause: error });
    throw error;
  }
  assert.equal(await updated.evaluate(`localStorage.getItem(${JSON.stringify(sentinelKey)})`), 'conservado');
  updated.close();
  console.log('PASS: 1.6.6.3 → 1.8.0 por el actualizador firmado de Windows; reinició y conservó los datos locales.');
} finally {
  current?.close();
  if (!old.killed && old.exitCode === null) old.kill();
}
