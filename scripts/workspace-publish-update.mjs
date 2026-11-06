import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {UPDATE_TARGETS,REPOSITORY,SOURCE_REPOSITORY,verifyCandidate,buildUpdateManifest,assertLegacyPublisherEndpoint} from './workspace-update-manifest.mjs';
import {verifyDatabaseAcceptance} from './workspace-database-acceptance.mjs';
import {buildReleaseManifest} from './workspace-release-manifest.mjs';
import {verifyPresentationAcceptance} from './workspace-identity-acceptance.mjs';
import {toNativeVersion} from '../src/workspace/releaseVersion.mjs';
import {CONNECTOR_BASELINE,verifyConnectorMaintenanceAcceptance} from './workspace-connector-maintenance-acceptance.mjs';
import {WORKSPACE_165_BASELINE,verifyWorkspace165Acceptance} from './workspace-165-release-acceptance.mjs';
import {CUARZO_BASELINE,verifyCuarzoAcceptance} from './workspace-cuarzo-release-acceptance.mjs';

async function main() {
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const runId=option('--run'),notesPath=option('--notes'),databaseProofPath=option('--database-acceptance'),identityProofPath=option('--identity-acceptance'),maintenanceProofPath=option('--maintenance-acceptance'),workspace165ProofPath=option('--workspace-1-6-5-acceptance'),publish=args.includes('--publish');
const cuarzoProofPath=option('--cuarzo-acceptance');
if(!/^\d+$/.test(runId||'')||!notesPath)throw Error('Usage: npm run desktop:publish -- --run RUN_ID --notes NOTES_FILE [--database-acceptance PROOF_FILE | --workspace-1-6-5-acceptance PROOF_FILE | --maintenance-acceptance PROOF_FILE] [--publish]');
const gh=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const config=JSON.parse(await fs.readFile('src-tauri/tauri.conf.json','utf8'));
assertLegacyPublisherEndpoint(config);
const baseManifest=await fs.readFile('public/gba/workspace/releases.json','utf8');
if(JSON.parse(baseManifest).version!=='1.5.0')throw Error('Public base must remain Workspace 1.5.0');
const release=JSON.parse(await fs.readFile('src/workspace/releaseInfo.json','utf8'));
if(release.nativeVersion!==config.version || toNativeVersion(release.version)!==config.version)throw Error('Native release identity differs');
const version=config.version,displayVersion=release.version,tag=`workspace-v${displayVersion}-beta.1`,feedTag='workspace-updates';
const key=process.env.WORKSPACE_UPDATE_SIGNING_KEY||path.join(os.homedir(),'.tauri/workspace-updates.key');
const publicKey=(await fs.readFile(`${key}.pub`,'utf8')).trim();
if(publicKey!==config.plugins.updater.pubkey)throw Error('Signing key does not match the public identity embedded in this app');
const info=JSON.parse(gh(['run','view',runId,'--repo',SOURCE_REPOSITORY,'--json','headSha,conclusion,name,url']));
if(info.conclusion!=='success'||info.name!=='Workspace native candidates')throw Error('All native candidate jobs must pass before publication');
const commit=info.headSha;
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(commit!==head)throw Error('Checkout must match the exact CI source commit');
const folder=path.resolve('release-candidates',`publish-${runId}`);
await fs.mkdir(folder,{recursive:true});
const lock=await fs.open(path.join(folder,'publication.lock'),'wx',0o600);
try {
  const downloads=[],updates=[],files=[];
  for(const target of UPDATE_TARGETS) {
    const [system,architecture]=target.split('-'),platform=system==='darwin'?'macos':system;
    const destination=path.join(folder,target);await fs.mkdir(destination,{recursive:true});
    try { await fs.access(path.join(destination,'packages.json')); }
    catch { gh(['run','download',runId,'--repo',SOURCE_REPOSITORY,'--name',`workspace-${platform}-${architecture}`,'--dir',destination]); }
    const metadata=JSON.parse(await fs.readFile(path.join(destination,'packages.json'),'utf8'));
    const startup=JSON.parse(await fs.readFile(path.join(destination,'startup.json'),'utf8'));
    const file=metadata.updaters?.[0]?.file;
    if(typeof file!=='string'||path.basename(file)!==file)throw Error('Invalid candidate filename');
    const bytes=await fs.readFile(path.join(destination,file));
    const artifact=verifyCandidate(metadata,startup,bytes,{commit,version,displayVersion,target});
    const installer=metadata.downloads[0],installerPath=path.join(destination,installer.file);
    if(path.basename(installer.file)!==installer.file)throw Error('Invalid installer filename');
    const installerBytes=await fs.readFile(installerPath);
    if(installerBytes.length!==installer.size||digest(installerBytes)!==installer.sha256)throw Error('Installer differs from CI acceptance');
    execFileSync(process.execPath,[path.resolve('node_modules/@tauri-apps/cli/tauri.js'),'signer','sign','--private-key-path',key,'--password','',path.join(destination,file)],{stdio:['ignore','pipe','pipe']});
    const verifier=process.env.WORKSPACE_UPDATE_VERIFIER||path.resolve('src-tauri/target/aarch64-apple-darwin/release/gba-workspace');
    execFileSync(verifier,['--verify-update',path.join(destination,file),path.join(destination,`${file}.sig`)],{stdio:['ignore','pipe','pipe']});
    const signature=(await fs.readFile(path.join(destination,`${file}.sig`),'utf8')).trim();
    const assetUrl=file=>`https://github.com/${REPOSITORY}/releases/download/${tag}/${encodeURIComponent(file)}`;
    updates.push({...artifact,url:assetUrl(file),signature});downloads.push({...installer,url:assetUrl(installer.file)});
    files.push(installerPath,path.join(destination,file),path.join(destination,`${file}.sig`));
  }
  let previous=null;
  const feedResponse=await fetch(`https://github.com/${REPOSITORY}/releases/download/${feedTag}/latest.json`,{signal:AbortSignal.timeout(15000)});
  if(feedResponse.ok)previous=await feedResponse.json();
  else if(feedResponse.status!==404)throw Error('Unable to verify the currently published update feed');
  const notes=await fs.readFile(notesPath,'utf8');
  const manifest=buildUpdateManifest({version,displayVersion,mandatory:release.mandatory,minimumNativeVersion:release.minimumNativeVersion,commit,notes,pubDate:new Date().toISOString(),artifacts:updates,previous});
  const manifestFile=path.join(folder,'latest.json');await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(folder,'packages.json'),JSON.stringify({commit,downloads,updaters:updates},null,2)+'\n');
  const proof={channel:'beta',betaDistributionAuthorized:true,commit,evidenceUrl:info.url,
    backupRestoreVerified:true,stagingAuthVerified:true,gatewayVerified:true,membershipRlsVerified:true,activationExpiryRevocationVerified:true,
    installedMacosVerified:true,installedWindowsVerified:true,
    priorIdentityAcceptance:'docs/workspace-activation.md',nativeInstalledAcceptanceRun:info.url,interactiveWindowsUpdateVerified:false};
  // Earlier identity/database acceptance is reusable only when that code is unchanged.
  const baseline='033686bfdd8e2bcd6223d8515fcad6d5b839eaf4';
  if(cuarzoProofPath){
    if(workspace165ProofPath||maintenanceProofPath||databaseProofPath||identityProofPath)throw Error('Cuarzo chained acceptance cannot be combined with other proofs');
    const published=JSON.parse(gh(['release','view',CUARZO_BASELINE.tag,'--repo',REPOSITORY,'--json','isDraft,targetCommitish']));
    if(published.isDraft||published.targetCommitish!==CUARZO_BASELINE.commit)throw Error('Cuarzo must inherit the exact public 1.6.5.1 release');
    const priorDirectory=path.join(folder,'prior-1.6.5.1-acceptance');await fs.mkdir(priorDirectory,{recursive:true});
    gh(['release','download',CUARZO_BASELINE.tag,'--repo',REPOSITORY,'--pattern','acceptance.json','--dir',priorDirectory,'--clobber']);
    const previousBytes=await fs.readFile(path.join(priorDirectory,'acceptance.json'));
    const cuarzoProof=JSON.parse(await fs.readFile(cuarzoProofPath,'utf8'));
    let roleTestedSchema;
    if(cuarzoProof.method==='read-only-schema-parity'){
      roleTestedSchema=JSON.parse(await fs.readFile(path.join(folder,'darwin-aarch64','workspace-schema.json'),'utf8'));
    }
    const changedProtectedFiles=execFileSync('git',['diff','--name-only',CUARZO_BASELINE.commit,commit,'--','supabase','api','src/auth','src/context/AuthContext.jsx','src/workspace/WorkspaceAuth.jsx','cloudflare'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
    proof.cuarzoAcceptance=await verifyCuarzoAcceptance(cuarzoProof,JSON.parse(previousBytes),{commit,projectRef:'wgihpztgwsovhykboyru',changedProtectedFiles,previousBytes,roleTestedSchema,expectedCiRun:{runId,url:info.url,headSha:commit,conclusion:info.conclusion}});
  }else if(workspace165ProofPath){
    if(maintenanceProofPath||databaseProofPath||identityProofPath)throw Error('The 1.6.5 chained acceptance cannot be combined with other acceptance proofs');
    const published=JSON.parse(gh(['release','view',WORKSPACE_165_BASELINE.tag,'--repo',REPOSITORY,'--json','tagName,isDraft,targetCommitish']));
    if(published.tagName!==WORKSPACE_165_BASELINE.tag||published.isDraft||published.targetCommitish!==WORKSPACE_165_BASELINE.commit)throw Error('Workspace 1.6.0.2 must be the exact public acceptance baseline');
    const priorDirectory=path.join(folder,'prior-1.6.0.2-acceptance');await fs.mkdir(priorDirectory,{recursive:true});
    gh(['release','download',WORKSPACE_165_BASELINE.tag,'--repo',REPOSITORY,'--pattern','acceptance.json','--dir',priorDirectory,'--clobber']);
    const priorBytes=await fs.readFile(path.join(priorDirectory,'acceptance.json'));
    const previous=JSON.parse(priorBytes.toString('utf8'));
    execFileSync('git',['fetch','--depth=1','origin',WORKSPACE_165_BASELINE.commit],{stdio:['ignore','pipe','pipe'],timeout:60000});
    const changedDatabaseFiles=execFileSync('git',['diff','--name-only',`${WORKSPACE_165_BASELINE.commit}..${commit}`,'--','supabase'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
    const changedIdentityFiles=execFileSync('git',['diff','--name-only',`${WORKSPACE_165_BASELINE.commit}..${commit}`,'--','api','src/auth','src/context/AuthContext.jsx','src/workspace/WorkspaceAuth.jsx','cloudflare'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
    proof.workspace165Acceptance=await verifyWorkspace165Acceptance(JSON.parse(await fs.readFile(workspace165ProofPath,'utf8')),previous,{commit,projectRef:'wgihpztgwsovhykboyru',changedDatabaseFiles,changedIdentityFiles,previousBytes:priorBytes,expectedCiRun:{runId,url:info.url,headSha:commit,conclusion:info.conclusion}});
  }else if(maintenanceProofPath){
    const published=JSON.parse(gh(['release','view',CONNECTOR_BASELINE.tag,'--repo',REPOSITORY,'--json','isDraft,targetCommitish']));
    if(published.isDraft||published.targetCommitish!==CONNECTOR_BASELINE.commit)throw Error('Connector baseline must be the exact public release');
    const priorDirectory=path.join(folder,'prior-acceptance');await fs.mkdir(priorDirectory,{recursive:true});
    gh(['release','download',CONNECTOR_BASELINE.tag,'--repo',REPOSITORY,'--pattern','acceptance.json','--dir',priorDirectory,'--clobber']);
    execFileSync('git',['fetch','--depth=1','origin',CONNECTOR_BASELINE.commit],{stdio:['ignore','pipe','pipe'],timeout:60000});
    const changedFiles=execFileSync('git',['diff','--name-only',CONNECTOR_BASELINE.commit,commit,'--','api','src/auth','src/context/AuthContext.jsx','src/workspace/WorkspaceAuth.jsx','supabase','cloudflare'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
    proof.connectorMaintenanceAcceptance=await verifyConnectorMaintenanceAcceptance(JSON.parse(await fs.readFile(maintenanceProofPath,'utf8')),JSON.parse(await fs.readFile(path.join(priorDirectory,'acceptance.json'),'utf8')),{commit,projectRef:'wgihpztgwsovhykboyru',changedFiles});
    if(proof.connectorMaintenanceAcceptance.evidence.nativeValidationRun!==info.url)throw Error('Connector acceptance must use the same completed native CI run');
  }else{
  const identityChanges=execFileSync('git',['diff','--name-only',baseline,commit,'--','api','src/auth','src/context/AuthContext.jsx'],{encoding:'utf8'}).trim();
  if(identityChanges) {
    if(!identityProofPath)throw Error('Identity code changed; fresh identity acceptance is required before public distribution');
    proof.identityAcceptance=await verifyPresentationAcceptance(JSON.parse(await fs.readFile(identityProofPath,'utf8')),{commit,files:identityChanges.split('\n'),baseline,projectRef:'wgihpztgwsovhykboyru'});
  }
  const databaseChanges=execFileSync('git',['diff','--name-only',baseline,commit,'--','supabase'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  if(databaseChanges.length) {
    if(!databaseProofPath) throw Error('Database code changed; explicit live database acceptance is required');
    proof.databaseAcceptance=await verifyDatabaseAcceptance(JSON.parse(await fs.readFile(databaseProofPath,'utf8')),{commit,files:databaseChanges,projectRef:'wgihpztgwsovhykboyru'});
  }
  }
  await fs.writeFile(path.join(folder,'acceptance.json'),JSON.stringify(proof,null,2)+'\n');
  const releaseNotes=path.join(folder,'release-notes.md');
  await fs.writeFile(releaseNotes,`${notes}\n\nBeta para macOS Apple Silicon, macOS Intel y Windows x64. macOS sin notarización de Apple; Windows sin firma Authenticode. Los paquetes de actualización se verifican con la firma privada de Workspace.\n\nCada instalador se instaló y abrió en su corredor nativo de CI. La actualización interactiva de Windows sigue pendiente de comprobación en un equipo real.\n\nCódigo: ${commit}\nComprobaciones: ${info.url}\n`);
  const unique=[...new Set(files)];
  if(!publish) {
    console.log(`Prepared ${tag}: all three installed candidates verified, update packages signed locally, latest.json ready. No release or update feed was published.`);
    return;
  }
  try { gh(['release','view',tag,'--repo',REPOSITORY]);throw Error('Release tag already exists; published package bytes must not be replaced'); }
  catch(error) { if(error.message==='Release tag already exists; published package bytes must not be replaced')throw error; }
  gh(['release','create',tag,...unique,path.join(folder,'packages.json'),path.join(folder,'acceptance.json'),'--repo',REPOSITORY,'--target',commit,'--draft','--prerelease','--title',`Workspace ${displayVersion} beta`,'--notes-file',releaseNotes]);
  console.log(`Prepared draft ${tag}; verified all three installed candidates and signed update packages locally.`);
  gh(['release','edit',tag,'--repo',REPOSITORY,'--draft=false','--prerelease']);
  // Verify permanent public bytes after making packages available, before
  // exposing any of them to the in-app updater.
  for(const artifact of updates) {
    const response=await fetch(artifact.url,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error('Public updater package is unavailable; update feed not promoted');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==artifact.size||digest(bytes)!==artifact.sha256)throw Error('Public updater bytes differ from signed candidate; feed not promoted');
  }
  const webManifest=await buildReleaseManifest({commit,downloads},proof);
  webManifest.mandatory=release.mandatory;
  await fs.writeFile(path.join(folder,'releases.json'),JSON.stringify(webManifest,null,2)+'\n');
  // Before first use, create a permanent feed release. Later promotions only
  // replace its discovery JSON; versioned binaries always remain immutable.
  if(previous) {
    const feed=JSON.parse(gh(['release','view',feedTag,'--repo',REPOSITORY,'--json','isDraft']));
    if(feed.isDraft)throw Error('Update feed release must be public before promotion');
    gh(['release','upload',feedTag,manifestFile,'--repo',REPOSITORY,'--clobber']);
  } else {
    gh(['release','create',feedTag,manifestFile,'--repo',REPOSITORY,'--target',commit,'--prerelease','--title','Workspace · canal de actualizaciones','--notes','Canal de descubrimiento de actualizaciones manuales. Los paquetes permanecen en sus versiones y llevan firmas verificadas por la app.']);
  }
  // The public base stays pinned to 1.5.0 until an explicit major base change.
  // Candidate installers remain available in the immutable version release.
  if((await fs.readFile('public/gba/workspace/releases.json','utf8'))!==baseManifest)throw Error('Public base installer manifest changed during publication');
  console.log(`Published Workspace ${displayVersion}: immutable beta installers and signed, manually installed update feed. Public 1.5.0 base preserved; newer installers are distributed through the update feed.`);
} finally {await lock.close();await fs.unlink(path.join(folder,'publication.lock'));}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
