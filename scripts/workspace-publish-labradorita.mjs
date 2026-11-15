// Publicación de escritorio de Workspace 1.8.x (Labradorita) para macOS y Windows.
// Pasos (cada uno se ejecuta a propósito, nunca todos de golpe):
//   --prepare  descarga los candidatos de la compilación nativa exacta, comprueba huellas y arranque, y firma las
//              actualizaciones con la llave local de Workspace. No publica nada.
//   --stage    crea la release inmutable workspace-vX-beta.1 y un canal aislado de prueba para Windows
//              (latest-windows-labradorita-beta.json). Las apps instaladas no lo ven.
//   --promote  comprueba los bytes públicos y actualiza latest-darwin.json y latest-windows.json. Guarda los canales
//              anteriores para poder volver atrás.
// La página pública de descargas (1.5.0) y el canal compartido latest.json (puente 1.6.6.3) no se tocan.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {REPOSITORY,SOURCE_REPOSITORY,UPDATE_TARGETS} from './workspace-update-manifest.mjs';
import {toNativeVersion} from '../src/workspace/releaseVersion.mjs';

const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?null:args[i+1];};
const runId=option('--run'),mode=['--prepare','--stage','--promote'].find(m=>args.includes(m));
if(!/^\d+$/.test(runId||'')||!mode)throw Error('Uso: node scripts/workspace-publish-labradorita.mjs --run RUN_ID --prepare|--stage|--promote');
const gh=a=>execFileSync('gh',a,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:600000});
const sha=b=>createHash('sha256').update(b).digest('hex');
const release=JSON.parse(await fs.readFile('src/workspace/releaseInfo.json','utf8'));
const config=JSON.parse(await fs.readFile('src-tauri/tauri.conf.json','utf8'));
if(!/^1\.8\.\d+(?:\.\d+)?$/.test(release.version)||release.codename!=='Labradorita')throw Error('Sólo publica Workspace 1.8.x Labradorita');
if(release.nativeVersion!==toNativeVersion(release.version)||config.version!==release.nativeVersion)throw Error('Versión nativa inconsistente');
if(JSON.stringify(config.plugins.updater.endpoints)!==JSON.stringify([`https://github.com/${REPOSITORY}/releases/download/workspace-updates/latest-{{target}}.json`]))throw Error('Canal de actualización inesperado');
if(JSON.parse(await fs.readFile('public/gba/workspace/releases.json','utf8')).version!=='1.5.0')throw Error('La base pública debe seguir en 1.5.0');
const key=path.join(os.homedir(),'.tauri/workspace-updates.key');
if((await fs.readFile(key+'.pub','utf8')).trim()!==config.plugins.updater.pubkey)throw Error('La llave local no corresponde a la identidad de la app');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const info=JSON.parse(gh(['run','view',runId,'--repo',SOURCE_REPOSITORY,'--json','headSha,conclusion,name,url']));
if(info.conclusion!=='success'||info.name!=='Workspace native candidates'||info.headSha!==commit)throw Error('Se requiere la compilación nativa exitosa del commit exacto');
const version=release.nativeVersion,display=release.version,tag=`workspace-v${display}-beta.1`,feed='workspace-updates';
const folder=path.resolve('release-candidates',`labradorita-${runId}`),out=path.join(folder,'release');
const assetUrl=file=>`https://github.com/${REPOSITORY}/releases/download/${tag}/${encodeURIComponent(file)}`;
const notes=`Workspace ${display} agrega producciones de diseño, coloca a cada persona en el área equivalente de ediciones, videos y diseños, y acepta códigos de licencia de Sepia.`;
const ARTIFACTS={'darwin-aarch64':'workspace-macos-aarch64','darwin-x86_64':'workspace-macos-x86_64','windows-x86_64':'workspace-windows-x86_64'};

if(mode==='--prepare'){
 await fs.rm(folder,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
 const downloads=[],updaters=[];
 for(const target of UPDATE_TARGETS){
  const dir=path.join(folder,target);
  gh(['run','download',runId,'--repo',SOURCE_REPOSITORY,'--name',ARTIFACTS[target],'--dir',dir]);
  const metadata=JSON.parse(await fs.readFile(path.join(dir,'packages.json'),'utf8')),startup=JSON.parse(await fs.readFile(path.join(dir,'startup.json'),'utf8'));
  if(metadata.commit!==commit||startup.commit!==commit)throw Error(`${target}: candidato de otro commit`);
  if(startup.installedAppTest!==true||startup.processStartup!==true||startup.installedExecutableMatches!==true)throw Error(`${target}: falta la prueba de instalación y arranque`);
  if(metadata.downloads?.length!==1||metadata.updaters?.length!==1)throw Error(`${target}: candidato ambiguo`);
  const installer=metadata.downloads[0],updater=metadata.updaters[0];
  if(`${updater.platform}-${updater.architecture}`!==target||installer.version!==version||updater.version!==version||installer.sha256!==startup.sha256)throw Error(`${target}: el candidato no coincide con la prueba`);
  for(const item of [installer,updater]){
   const bytes=await fs.readFile(path.join(dir,item.file));
   if(bytes.length!==item.size||sha(bytes)!==item.sha256)throw Error(`${item.file}: huella distinta`);
   await fs.copyFile(path.join(dir,item.file),path.join(out,item.file));
  }
  execFileSync(process.execPath,[path.resolve('node_modules/@tauri-apps/cli/tauri.js'),'signer','sign','--private-key-path',key,'--password','',path.join(out,updater.file)],{stdio:['ignore','pipe','pipe']});
  // El archivo .sig de Tauri ya está en base64; es el valor que espera el canal de actualización.
  const signature=(await fs.readFile(path.join(out,`${updater.file}.sig`),'utf8')).trim();
  if(Buffer.from(signature,'base64').length<100)throw Error(`${updater.file}: firma inválida`);
  downloads.push({...installer,displayVersion:display,url:assetUrl(installer.file)});
  updaters.push({...updater,displayVersion:display,url:assetUrl(updater.file),signature});
 }
 const packages={version,displayVersion:display,commit,build:info.url,downloads,updaters};
 await fs.writeFile(path.join(out,'packages.json'),JSON.stringify(packages,null,2)+'\n');
 await fs.writeFile(path.join(out,'SHA256SUMS'),[...downloads,...updaters.filter(u=>!downloads.some(d=>d.file===u.file))].map(x=>`${x.sha256}  ${x.file}`).join('\n')+'\n');
 const feedFor=targets=>({version,displayVersion:display,mandatory:false,notes,pub_date:new Date().toISOString(),commit,platforms:Object.fromEntries(targets.map(t=>{const u=updaters.find(x=>`${x.platform}-${x.architecture}`===t);return [t,{url:u.url,signature:u.signature}];}))});
 await fs.writeFile(path.join(folder,'latest-darwin.json'),JSON.stringify(feedFor(['darwin-aarch64','darwin-x86_64']),null,2)+'\n');
 await fs.writeFile(path.join(folder,'latest-windows.json'),JSON.stringify(feedFor(['windows-x86_64']),null,2)+'\n');
 // Canal aislado de prueba: el actualizador con objetivo propio busca su nombre como plataforma.
 const staged=feedFor(['windows-x86_64']);staged.platforms['windows-labradorita-beta']=staged.platforms['windows-x86_64'];
 await fs.writeFile(path.join(folder,'latest-windows-labradorita-beta.json'),JSON.stringify(staged,null,2)+'\n');
 await fs.writeFile(path.join(folder,'release-notes.md'),`## Workspace ${display} Labradorita · Beta\n\n${notes}\n\nInstaladores para macOS con Apple Silicon o Intel y Windows x64. macOS aún no cuenta con notarización de Apple y el instalador de Windows no tiene firma Authenticode. La app verifica la firma de Workspace para cada actualización.\n\nCódigo: [${commit.slice(0,7)}](https://github.com/${SOURCE_REPOSITORY}/commit/${commit}). Instalación y arranque verificados en los tres corredores nativos. [Compilación](${info.url})\n`);
 console.log(`Preparado ${tag} en ${folder}: 3 candidatos verificados y 3 actualizaciones firmadas. No se publicó nada.`);
}

if(mode==='--stage'){
 const files=(await fs.readdir(out)).map(f=>path.join(out,f));
 const exists=(()=>{try{gh(['release','view',tag,'--repo',REPOSITORY,'--json','tagName']);return true;}catch{return false;}})();
 if(exists)throw Error(`${tag} ya existe; no se reemplaza una release publicada`);
 gh(['release','create',tag,...files,'--repo',REPOSITORY,'--prerelease','--title',`Workspace ${display} Labradorita · Beta`,'--notes-file',path.join(folder,'release-notes.md')]);
 gh(['release','upload',feed,path.join(folder,'latest-windows-labradorita-beta.json'),'--repo',REPOSITORY,'--clobber']);
 console.log(`Publicada ${tag} y el canal aislado de prueba de Windows. latest-darwin.json y latest-windows.json no cambiaron.`);
}

if(mode==='--promote'){
 const packages=JSON.parse(await fs.readFile(path.join(out,'packages.json'),'utf8'));
 for(const item of [...packages.downloads,...packages.updaters]){
  const response=await fetch(item.url,{signal:AbortSignal.timeout(180000)});
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!response.ok||bytes.length!==item.size||sha(bytes)!==item.sha256)throw Error(`${item.file}: los bytes públicos no coinciden; no se promueve`);
 }
 const backup=path.join(folder,'previous');await fs.mkdir(backup,{recursive:true});
 for(const name of ['latest-darwin.json','latest-windows.json']){
  const response=await fetch(`https://github.com/${REPOSITORY}/releases/download/${feed}/${name}`,{signal:AbortSignal.timeout(30000)});
  const previous=await response.text();await fs.writeFile(path.join(backup,name),previous);
  const prior=JSON.parse(previous).version.split('.').map(Number),next=version.split('.').map(Number);
  if(!(next[0]>prior[0]||(next[0]===prior[0]&&(next[1]>prior[1]||(next[1]===prior[1]&&next[2]>prior[2])))))throw Error(`${name}: la versión no aumenta`);
 }
 gh(['release','upload',feed,path.join(folder,'latest-darwin.json'),path.join(folder,'latest-windows.json'),'--repo',REPOSITORY,'--clobber']);
 for(const name of ['latest-darwin.json','latest-windows.json']){
  const live=await fetch(`https://github.com/${REPOSITORY}/releases/download/${feed}/${name}?v=${Date.now()}`).then(r=>r.json());
  if(live.version!==version)throw Error(`${name}: el canal publicado no muestra ${version}`);
 }
 try{gh(['release','delete-asset',feed,'latest-windows-labradorita-beta.json','--repo',REPOSITORY,'--yes']);}catch{}
 console.log(`Promovida ${display} (${version}) en latest-darwin.json y latest-windows.json. Canales anteriores guardados en ${backup}.`);
}
