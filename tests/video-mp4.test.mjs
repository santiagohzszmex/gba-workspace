// Workspace 1.8.0 Labradorita · Lectura de copias de revisión MP4 en la pasarela.
// Parte 1: MP4 sintéticos (siempre). Parte 2: videos reales hechos con ffmpeg, si está instalado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectMp4} from '../cloudflare/workspace-originals/images/mp4.mjs';
import {makeMp4,memoryFile} from './helpers/mp4.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const bad=async(bytes,re)=>{await assert.rejects(inspectMp4(memoryFile(bytes)),error=>re.test(error.message)&&error.status===400);checks++;};
const read=bytes=>inspectMp4(memoryFile(bytes));

eq(await read(makeMp4()),{verification:'mp4',width:1280,height:720,duration_ms:30000,video_codec:'avc1',audio_codec:'mp4a',faststart:true});
eq((await read(makeMp4({moovFirst:false}))).faststart,false);
eq(await read(makeMp4({width:720,height:1280,durationMs:1500,audio:null})),{verification:'mp4',width:720,height:1280,duration_ms:1500,video_codec:'avc1',audio_codec:null,faststart:true});
// La lectura no decide límites (eso lo hace la base de datos con la política vigente), sólo informa.
eq((await read(makeMp4({width:1920,height:1080}))).width,1920);
eq((await read(makeMp4({codec:'hvc1'}))).video_codec,'hvc1');
await bad(makeMp4({brand:'qt  '}),/QuickTime/);
await bad(makeMp4({fragmented:true}),/fragmentado/);
await bad(makeMp4({audio:'lpcm'}),/AAC/);
await bad(makeMp4({videoTracks:2}),/varias pistas de video/);
await bad(makeMp4({videoTracks:0}),/no tiene pista de video/);
await bad(Buffer.from('%PDF-1.7 no es un video, sólo texto de relleno'),/No es un MP4/);
await bad(makeMp4().subarray(0,200),/truncad/);
await bad(Buffer.alloc(8),/vacío|truncad/);
// Sólo lee cabeceras e índice: el contenido grande (mdat) nunca se lee completo.
{const bytes=makeMp4({mdatBytes:2*1024*1024,moovFirst:false});let read=0;const file={size:bytes.length,slice:(a,b)=>({arrayBuffer:async()=>{read+=b-a;return Uint8Array.from(bytes.subarray(a,b)).buffer;}})};
 await inspectMp4(file);eq(read<64*1024,true);}

let real='omitida (sin ffmpeg)';
try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});real='ok';}catch{}
if(real==='ok'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-video-'));
 const make=(name,args)=>{const file=path.join(dir,name);execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3',...args,file]);return fs.readFileSync(file);};
 const fileOf=bytes=>memoryFile(bytes);
 try{
  // Lo que exporta Blender con el ajuste de Workspace: H.264 + AAC en MPEG-4 (índice al final).
  const blender=make('blender.mp4',['-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k']);
  const info=await inspectMp4(fileOf(blender));
  eq([info.width,info.height,info.video_codec,info.audio_codec,info.faststart],[1280,720,'avc1','mp4a',false]);
  eq(Math.abs(info.duration_ms-3000)<=60,true);
  eq((await inspectMp4(fileOf(make('faststart.mp4',['-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart'])))).faststart,true);
  const vertical=await inspectMp4(fileOf(make('vertical.mp4',['-vf','scale=720:1280,setsar=1','-c:v','libx264','-pix_fmt','yuv420p','-an'])));
  eq([vertical.width,vertical.height,vertical.audio_codec],[720,1280,null]);
  eq((await inspectMp4(fileOf(make('full-hd.mp4',['-vf','scale=1920:1080','-c:v','libx264','-pix_fmt','yuv420p','-an'])))).height,1080);
  await assert.rejects(inspectMp4(fileOf(make('quicktime.mov',['-c:v','libx264','-pix_fmt','yuv420p','-an']))),/QuickTime/);checks++;
  await assert.rejects(inspectMp4(fileOf(make('fragmented.mp4',['-c:v','libx264','-pix_fmt','yuv420p','-an','-movflags','frag_keyframe+empty_moov']))),/fragmentado/);checks++;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
console.log(`PASS: ${checks} comprobaciones de MP4 (videos reales: ${real}).`);
