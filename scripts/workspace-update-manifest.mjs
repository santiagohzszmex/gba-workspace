import { createHash } from 'node:crypto';
import { toNativeVersion } from '../src/workspace/releaseVersion.mjs';
export const UPDATE_TARGETS=['darwin-aarch64','darwin-x86_64','windows-x86_64'];
// Canal de actualizaciones: las apps instaladas leen latest-*.json de las releases de este repo.
// No cambiar sin publicar antes una versión de transición que apunte su actualizador al nuevo canal.
export const REPOSITORY='santiagohzszmex/GBA-VISTA-seeitdifferently';
// Repo del código de Workspace (desde 2026-11-05): ahí corre la compilación nativa (CI).
export const SOURCE_REPOSITORY=process.env.WORKSPACE_SOURCE_REPOSITORY||'santiagohzszmex/gba-workspace';
export function assertLegacyPublisherEndpoint(config) {
  const expected=`https://github.com/${REPOSITORY}/releases/download/workspace-updates/latest.json`;
  if(JSON.stringify(config.plugins?.updater?.endpoints)!==JSON.stringify([expected]))throw Error('Platform-channel releases must use their platform publisher; latest.json is reserved for the legacy compatibility bridge');
}
export function versionParts(version) {
  if(!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Version must contain three numeric components');
  const values=version.split('.').map(Number);
  if(values.some(v=>!Number.isSafeInteger(v))) throw Error('Invalid version');
  return values;
}
export function newerThan(version,previous) {
  const a=versionParts(version),b=versionParts(previous);
  for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];
  return false;
}
export function verifyCandidate(metadata,startup,bytes,{commit,version,displayVersion=version,target}) {
  if(!/^[a-f0-9]{40}$/.test(commit)||!UPDATE_TARGETS.includes(target)) throw Error('Invalid release identity');
  if(metadata.commit!==commit||startup.commit!==commit) throw Error('Mixed candidate commits');
  if(startup.installedAppTest!==true||startup.processStartup!==true||startup.installedExecutableMatches!==true) throw Error('Installed candidate acceptance required');
  if(metadata.updaters?.length!==1||metadata.downloads?.length!==1) throw Error('Ambiguous candidate');
  const artifact=metadata.updaters[0],installer=metadata.downloads[0];
  if(`${artifact.platform}-${artifact.architecture}`!==target||artifact.version!==version||installer.version!==version||installer.sha256!==startup.sha256) throw Error('Candidate differs from acceptance');
  const nativeTarget=`${installer.platform==='macos'?'darwin':installer.platform}-${installer.architecture}`;
  if(nativeTarget!==target||startup.platform!==installer.platform) throw Error('Acceptance platform mismatch');
  if(artifact.size!==bytes.length||!/^([a-f0-9]{64})$/.test(artifact.sha256)||createHash('sha256').update(bytes).digest('hex')!==artifact.sha256) throw Error('Candidate bytes differ from CI');
  if(displayVersion!==version && (artifact.displayVersion!==displayVersion||installer.displayVersion!==displayVersion||toNativeVersion(displayVersion)!==version)) throw Error('Public candidate version differs');
  const expected=target.startsWith('darwin-')?`workspace-${displayVersion}-${target}.app.tar.gz`:`gba-workspace-${displayVersion}-windows-x86_64.exe`;
  if(artifact.file!==expected) throw Error('Unexpected updater filename');
  return artifact;
}
export function buildUpdateManifest({version,displayVersion=version,mandatory=false,minimumNativeVersion=null,commit,notes,pubDate,artifacts,previous,requiredTargets=UPDATE_TARGETS}) {
  if(JSON.stringify(requiredTargets)!==JSON.stringify(UPDATE_TARGETS)&&JSON.stringify(requiredTargets)!==JSON.stringify(UPDATE_TARGETS.slice(0,2)))throw Error('Unsupported publication scope');
  versionParts(version);
  if(displayVersion!==version && toNativeVersion(displayVersion)!==version)throw Error('Public and native versions differ');
  if(minimumNativeVersion) { versionParts(minimumNativeVersion); if(newerThan(minimumNativeVersion,version))throw Error('Minimum version exceeds release'); }
  if(mandatory && minimumNativeVersion!==version)throw Error('Mandatory release must require its version');
  if(previous&&!newerThan(version,previous.version))throw Error('Update publication must increase the version');
  if(!/^[a-f0-9]{40}$/.test(commit)||!Number.isFinite(Date.parse(pubDate))||typeof notes!=='string'||notes.length>10000)throw Error('Invalid update metadata');
  const platforms={};
  for(const artifact of artifacts) {
    const target=`${artifact.platform}-${artifact.architecture}`;
    if(!requiredTargets.includes(target)||platforms[target]||artifact.version!==version)throw Error('Duplicate or mismatched update target');
    const url=new URL(artifact.url);
    const prefix=`https://github.com/${REPOSITORY}/releases/download/workspace-v${displayVersion}-beta.1/`;
    if(!artifact.url.startsWith(prefix)||url.search||url.hash||url.username||url.password||decodeURIComponent(url.pathname.split('/').at(-1))!==artifact.file)throw Error('Updater must use the permanent release asset');
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(artifact.signature||'')||Buffer.from(artifact.signature,'base64').length<100)throw Error('Missing native updater signature');
    platforms[target]={url:artifact.url,signature:artifact.signature};
  }
  if(requiredTargets.some(target=>!platforms[target]))throw Error('All three desktop targets are required unless publishing both macOS architectures separately');
  return {version,displayVersion,mandatory,...(minimumNativeVersion?{minimumNativeVersion}:{}),notes,pub_date:pubDate,commit,platforms};
}
