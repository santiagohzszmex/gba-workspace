import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const config=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
const csp=config.app.security.csp;
assert.match(csp,/script-src 'self' 'wasm-unsafe-eval';/);
assert.match(csp,/frame-src blob:/);
assert.doesNotMatch(csp,/frame-src[^;]*https:/);
assert.match(csp,/img-src[^;]*blob:/);
// Labradorita: las copias de revisión de video se reproducen desde la pasarela de archivos.
assert.match(csp,/media-src 'self' blob: https:\/\/\*\.workers\.dev;/);
assert.doesNotMatch(csp,/(?:^|\s)'unsafe-eval'(?:\s|;)/);
for(const host of ['https://gba.software','https://vista.gba.software','https://*.supabase.co']) assert.ok(csp.includes(host));
const web=fs.readFileSync('src/views/Workspace.jsx','utf8');
assert.ok(!web.includes('<LicenseGate'));
const desktop=fs.readFileSync('src/workspace/desktop.jsx','utf8');
assert.ok(desktop.includes('<LicenseGate><Workspace/>'));
const capability=JSON.parse(fs.readFileSync('src-tauri/capabilities/default.json','utf8'));
assert.ok(!JSON.stringify(capability).match(/shell:|fs:|http:/));
const env={...process.env,VITE_SUPABASE_URL:'https://wgihpztgwsovhykboyru.supabase.co',VITE_GBA_ID_API_URL:'https://gba.software/api/gba-id'};
for(const role of ['anon','service_role']) {
 const key=`header.${Buffer.from(JSON.stringify({role,ref:'wgihpztgwsovhykboyru'})).toString('base64url')}.signature`;
 const result=spawnSync(process.execPath,['scripts/workspace-client-config.mjs'],{env:{...env,VITE_SUPABASE_ANON_KEY:key},encoding:'utf8'});
 assert.equal(result.status,role==='anon'?0:1);
}
assert.equal(spawnSync(process.execPath,['scripts/workspace-client-config.mjs'],{env:{...env,VITE_SUPABASE_ANON_KEY:'sb_secret_forbidden'},encoding:'utf8'}).status,1);
console.log('PASS: desktop CSP, minimal capabilities, web/desktop license separation and rejection of service keys.');
