// Separate macOS channel: NEVER relabel an older Windows binary as a newer version.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {toNativeVersion} from '../src/workspace/releaseVersion.mjs';
import {createHash} from 'node:crypto';
import {REPOSITORY,SOURCE_REPOSITORY,UPDATE_TARGETS,verifyCandidate,buildUpdateManifest} from './workspace-update-manifest.mjs';
const args=process.argv.slice(2),option=n=>args[args.indexOf(n)+1];
if(!args.includes('--run')||!args.includes('--acceptance'))throw Error('Required: --run RUN_ID --acceptance PRIVATE_PROOF [--publish]');
const runId=option('--run'),publish=args.includes('--publish'),targets=UPDATE_TARGETS.slice(0,2);
if(!/^\d+$/.test(runId))throw Error('Invalid run');
const gh=a=>execFileSync('gh',a,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});
const sha=b=>createHash('sha256').update(b).digest('hex');
const release=JSON.parse(await fs.readFile('src/workspace/releaseInfo.json'));
const config=JSON.parse(await fs.readFile('src-tauri/tauri.conf.json'));
if(!/^1\.7\.\d+(?:\.\d+)?$/.test(release.version)||release.nativeVersion!==toNativeVersion(release.version)||config.version!==release.nativeVersion||release.codename!=='Lapislázuli')throw Error('Unexpected release');
if(config.plugins.updater.endpoints[0]!==`https://github.com/${REPOSITORY}/releases/download/workspace-updates/latest-{{target}}.json`)throw Error('Separate update endpoint required');
const base=await fs.readFile('public/gba/workspace/releases.json');if(JSON.parse(base).version!=='1.5.0')throw Error('Base must remain 1.5.0');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const info=JSON.parse(gh(['run','view',runId,'--repo',SOURCE_REPOSITORY,'--json','headSha,conclusion,name,url']));
if(info.conclusion!=='success'||info.headSha!==commit||info.name!=='Workspace native candidates')throw Error('Exact successful native CI required');
const acceptance=JSON.parse(await fs.readFile(option('--acceptance')));
if(acceptance.commit!==commit||acceptance.projectRef!=='wgihpztgwsovhykboyru'||!acceptance.backupRestoreVerified||!acceptance.documentReadVerified||!acceptance.documentWriteVerified||acceptance.imagesEnabled!==true||(release.version==='1.7.0'?JSON.stringify(acceptance.imageProjectIds)!==JSON.stringify(['8cde6736-e742-4a11-8a53-cb320b36b055']):acceptance.imagesAllProjects!==true)||acceptance.derivativesEnabled!==false||!/^[a-f\d-]{36}$/.test(acceptance.workerVersion||'')||acceptance.cpuMs!==1000||acceptance.serverHash!=='full-sha256')throw Error('Complete pilot deployment evidence required');
if(!Array.isArray(acceptance.migrations)||acceptance.migrations.length!==(release.version==='1.7.0'?7:8))throw Error('Reviewed migration set required');
for(const m of acceptance.migrations){if(!/^supabase\/migrations\/\d+_workspace_(?:lapis_[a-z_]+|deadline_receipts)\.sql$/.test(m.file)||sha(await fs.readFile(m.file))!==m.sha256)throw Error('Migration differs from deployment evidence');}
if(toNativeVersion(release.version).startsWith('1.7.') && Number(release.nativeVersion.split('.')[2])>=102){
 const correction=acceptance.closedEditionCorrection;
 if(!correction || correction.migration?.file!=='supabase/migrations/20261101183053_workspace_closed_editions.sql' || sha(await fs.readFile(correction.migration.file))!==correction.migration.sha256 || correction.productionSchemaVerified!==true || correction.localSqlAssertions<68 || correction.liveTestWrites!==false || correction.changedProjectStatuses!==false)throw Error('Reviewed closed-edition migration and production verification required');
 if(correction.projectContentMigration?.file!=='supabase/migrations/20261101184906_workspace_closed_project_content.sql' || sha(await fs.readFile(correction.projectContentMigration.file))!==correction.projectContentMigration.sha256)throw Error('Closed project concept migration evidence required');
}
if(Number(release.nativeVersion.split('.')[2])>=103){
 const update=acceptance.visualFunctionsCorrection;
 if(!update || update.productionCatalogVerified!==true || update.matrixUnchanged!==true || update.memberAssignmentsChanged!==false || update.localRoleChecks<13)throw Error('Visual function scope evidence required');
 for(const migration of [update.migration,update.recruitmentMigration])if(!migration || !/^supabase\/migrations\/2026110119375[56]_(?:gimg_november_period|workspace_visual_functions)\.sql$/.test(migration.file) || sha(await fs.readFile(migration.file))!==migration.sha256)throw Error('New-period migration evidence differs');
}
if(release.version==='1.7.1.4'){
 const update=acceptance.deviceNotificationsCorrection;
 if(!update||update.productionSchemaVerified!==true||update.schedulerVerified!==true||update.localSqlChecks<25||update.clientAndTransportTests!==true||update.liveTestWrites!==false||update.deviceReceiptVerified!==false)throw Error('Reviewed notification delivery evidence required; real device permission remains user controlled');
 for(const migration of update.migrations||[])if(!/^supabase\/migrations\/2026110120204[68]_workspace_(?:device_notifications|push_runtime)\.sql$/.test(migration.file)||sha(await fs.readFile(migration.file))!==migration.sha256)throw Error('Notification migration evidence differs');
 if(update.migrations?.length!==2)throw Error('Both notification migrations required');
}
if(Number(release.nativeVersion.split('.')[2])>=500){
 const bridge=acceptance.ultramarBridge;
 if(!bridge||bridge.migration?.file!=='supabase/migrations/20261104010000_workspace_ultramar_bridge.sql'||sha(await fs.readFile(bridge.migration.file))!==bridge.migration.sha256||bridge.productionFunctionsMatching!==16||bridge.hashVectorsVerified!==3||bridge.enabled!==true||!/^[0-9a-f-]{36}$/.test(bridge.workerVersion||'')||bridge.gatewaySmoke?.ultramarWithoutSession!==401||bridge.gatewaySmoke?.originalsWithoutSession!==401||bridge.localSqlChecks<50||bridge.gatewayChecks<36)throw Error('Ultramar bridge production evidence required');
}
if(Date.now()-Date.parse(acceptance.verifiedAt)>86400000||!Number.isFinite(Date.parse(acceptance.verifiedAt)))throw Error('Fresh deployment evidence required');
const key=path.join(os.homedir(),'.tauri/workspace-updates.key');
if((await fs.readFile(key+'.pub','utf8')).trim()!==config.plugins.updater.pubkey)throw Error('Wrong signing identity');
const folder=path.resolve('release-candidates',`macos-${runId}`);await fs.mkdir(folder,{recursive:true});
const lock=await fs.open(path.join(folder,'publication.lock'),'wx',0o600);
try{
 const files=[],updates=[],downloads=[],tag=`workspace-v${release.version}-beta.1`;
 for(const target of targets){
  const architecture=target.split('-')[1],dest=path.join(folder,target);await fs.mkdir(dest,{recursive:true});
  try{await fs.access(path.join(dest,'packages.json'));}catch{gh(['run','download',runId,'--repo',SOURCE_REPOSITORY,'--name',`workspace-macos-${architecture}`,'--dir',dest]);}
  const metadata=JSON.parse(await fs.readFile(path.join(dest,'packages.json'))),startup=JSON.parse(await fs.readFile(path.join(dest,'startup.json')));
  const file=metadata.updaters?.[0]?.file;if(!file||path.basename(file)!==file)throw Error('Invalid candidate file');
  const bytes=await fs.readFile(path.join(dest,file)),artifact=verifyCandidate(metadata,startup,bytes,{commit,version:release.nativeVersion,displayVersion:release.version,target});
  const installer=metadata.downloads[0];if(path.basename(installer.file)!==installer.file)throw Error('Invalid installer');
  const installerBytes=await fs.readFile(path.join(dest,installer.file));if(installerBytes.length!==installer.size||sha(installerBytes)!==installer.sha256)throw Error('Installer bytes mismatch');
  execFileSync(process.execPath,['node_modules/@tauri-apps/cli/tauri.js','signer','sign','--private-key-path',key,'--password','',path.join(dest,file)],{stdio:['ignore','pipe','pipe']});
  execFileSync('/Applications/Workspace.app/Contents/MacOS/gba-workspace',['--verify-update',path.join(dest,file),path.join(dest,file+'.sig')],{stdio:['ignore','pipe','pipe']});
  const signature=(await fs.readFile(path.join(dest,file+'.sig'),'utf8')).trim(),url=f=>`https://github.com/${REPOSITORY}/releases/download/${tag}/${encodeURIComponent(f)}`;
  updates.push({...artifact,url:url(file),signature});downloads.push({...installer,url:url(installer.file)});files.push(path.join(dest,file),path.join(dest,file+'.sig'),path.join(dest,installer.file));
 }
 const notes=await fs.readFile('docs/workspace/lapis-release-notes.md','utf8');
 const currentFeed=await fetch(`https://github.com/${REPOSITORY}/releases/download/workspace-updates/latest-darwin.json`);if(!currentFeed.ok&&currentFeed.status!==404)throw Error('Cannot verify current macOS channel');const previous=currentFeed.ok?await currentFeed.json():null;
 const manifest=buildUpdateManifest({previous,version:release.nativeVersion,displayVersion:release.version,commit,notes,pubDate:new Date().toISOString(),artifacts:updates,requiredTargets:targets});
 const feedFile=path.join(folder,'latest-darwin.json');await fs.writeFile(feedFile,JSON.stringify(manifest,null,2)+'\n');
 const proof={...acceptance,nativeCi:info.url,installedMacosVerified:true,interactiveWindowsVerified:false,realPilotSmoke:'pending Santiago and reviewer',downloads};
 await fs.writeFile(path.join(folder,'acceptance.json'),JSON.stringify(proof,null,2)+'\n');
 await fs.writeFile(path.join(folder,'packages.json'),JSON.stringify({commit,downloads,updaters:updates},null,2)+'\n');
 await fs.writeFile(path.join(folder,'release-notes.md'),notes+`\nCódigo: ${commit} (${SOURCE_REPOSITORY})\nCompilación, instalación y arranque en ambos corredores macOS: ${info.url}\n`);
 if(!publish){console.log('Prepared signed macOS-only release; no public changes.');process.exitCode=0;}
 else{
  const sharedUrl=`https://github.com/${REPOSITORY}/releases/download/workspace-updates/latest.json`;
  const shared=await fetch(sharedUrl);if(!shared.ok)throw Error('Cannot preserve shared update channel');const prior=Buffer.from(await shared.arrayBuffer());
  const releases=JSON.parse(gh(['release','list','--repo',REPOSITORY,'--limit','100','--json','tagName']));if(releases.some(r=>r.tagName===tag))throw Error('Immutable release already exists');
  gh(['release','create',tag,...files,path.join(folder,'packages.json'),path.join(folder,'acceptance.json'),'--repo',REPOSITORY,...(SOURCE_REPOSITORY===REPOSITORY?['--target',commit]:[]),'--draft','--prerelease','--title',`Workspace ${release.version} Lapislázuli · macOS`,'--notes-file',path.join(folder,'release-notes.md')]);
  gh(['release','edit',tag,'--repo',REPOSITORY,'--draft=false','--prerelease']);
  for(const p of [...updates,...downloads]){const r=await fetch(p.url);if(!r.ok)throw Error('Public package unavailable; feed not promoted');const b=Buffer.from(await r.arrayBuffer());if(b.length!==p.size||sha(b)!==p.sha256)throw Error('Public package bytes differ; feed not promoted');}
  gh(['release','upload','workspace-updates',feedFile,'--repo',REPOSITORY,'--clobber']);
  const after=await fetch(sharedUrl);if(!after.ok||sha(Buffer.from(await after.arrayBuffer()))!==sha(prior)||sha(await fs.readFile('public/gba/workspace/releases.json'))!==sha(base))throw Error('Shared feed or public base changed');
  console.log(`Published https://github.com/${REPOSITORY}/releases/tag/${tag}; macOS feed only, Windows/shared feed/base unchanged.`);
 }
}finally{await lock.close();await fs.unlink(path.join(folder,'publication.lock'));}
