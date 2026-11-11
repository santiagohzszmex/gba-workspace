// Sólo servidor de desarrollo: videos de prueba para la demostración local de video (Labradorita).
// Se generan con ffmpeg en una carpeta temporal la primera vez que se piden; nunca forman parte de la app publicada.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const SAMPLES={
 'sample-v1.mp4':['-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=330:sample_rate=48000'],
 'sample-v2.mp4':['-f','lavfi','-i','testsrc=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000']
};
export function videoDevFixtures(){return {name:'local-video-demo-fixtures',apply:'serve',configureServer(server){
 const root=path.join(os.tmpdir(),'workspace-video-demo');
 server.middlewares.use('/__video',(req,res)=>{
  const name=(req.url||'').split('?')[0].replace(/^\//,'');
  if(!SAMPLES[name]){res.statusCode=404;res.end();return;}
  const file=path.join(root,name);
  try{
   if(!fs.existsSync(file)){fs.mkdirSync(root,{recursive:true});execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...SAMPLES[name],'-t','12','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',file]);}
  }catch{res.statusCode=503;res.end('Instala ffmpeg para ver los videos de demostración.');return;}
  const size=fs.statSync(file).size,range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','no-store');
  if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),size-1):size-1;res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);res.setHeader('Content-Length',String(end-start+1));fs.createReadStream(file,{start,end}).pipe(res);return;}
  res.setHeader('Content-Length',String(size));fs.createReadStream(file).pipe(res);
 });
}};}
