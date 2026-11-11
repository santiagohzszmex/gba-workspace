// Workspace 1.8.0 Labradorita · Lectura acotada de una copia de revisión MP4.
// Sólo lee cabeceras de cajas y la caja «moov» (índice del video); nunca decodifica imágenes ni sonido.
// Devuelve tamaño de imagen, duración y formatos para que la base de datos aplique los límites vigentes.
const problem=message=>Object.assign(Error(message),{status:400});
const MAX_TOP_BOXES=64,MAX_MOOV=16*1024*1024,MP4_BRANDS=new Set(['isom','iso2','iso3','iso4','iso5','iso6','mp41','mp42','avc1','M4V ','M4A ','dash','msnv','XAVC','f4v ']);
const text=(bytes,at)=>String.fromCharCode(bytes[at],bytes[at+1],bytes[at+2],bytes[at+3]);
const u32=(view,at)=>view.getUint32(at);
const u64=(view,at)=>{const value=view.getUint32(at)*2**32+view.getUint32(at+4);if(!Number.isSafeInteger(value))throw problem('MP4 inválido: tamaño de caja fuera de rango.');return value;};
async function read(file,start,length){const bytes=new Uint8Array(await file.slice(start,start+length).arrayBuffer());if(bytes.length!==length)throw problem('MP4 inválido: archivo truncado.');return bytes;}

// Cajas hijas dentro de un bloque ya leído.
function* children(bytes,start=0,end=bytes.length){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=start,count=0;
 while(at+8<=end){
  if(++count>4096)throw problem('MP4 inválido: demasiadas cajas.');
  let size=u32(view,at),header=8;const type=text(bytes,at+4);
  if(size===1){if(at+16>end)throw problem('MP4 inválido: caja truncada.');size=u64(view,at+8);header=16;}
  else if(size===0)size=end-at;
  if(size<header||at+size>end)throw problem('MP4 inválido: caja truncada.');
  yield {type,start:at,body:at+header,end:at+size};at+=size;
 }
}
const find=(bytes,box,type)=>{for(const child of children(bytes,box.body,box.end))if(child.type===type)return child;return null;};
const all=(bytes,box,type)=>[...children(bytes,box.body,box.end)].filter(child=>child.type===type);

function trackInfo(bytes,trak){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const mdia=find(bytes,trak,'mdia'),tkhd=find(bytes,trak,'tkhd');if(!mdia||!tkhd)return null;
 const hdlr=find(bytes,mdia,'hdlr'),mdhd=find(bytes,mdia,'mdhd');if(!hdlr||!mdhd)return null;
 const handler=text(bytes,hdlr.body+8);
 const mdVersion=bytes[mdhd.body];
 const timescale=mdVersion===1?u32(view,mdhd.body+20):u32(view,mdhd.body+12);
 const duration=mdVersion===1?u64(view,mdhd.body+24):u32(view,mdhd.body+16);
 const display={width:Math.round(u32(view,tkhd.end-8)/65536),height:Math.round(u32(view,tkhd.end-4)/65536)};
 const stbl=find(bytes,find(bytes,mdia,'minf')||{body:0,end:0},'stbl'),stsd=stbl&&find(bytes,stbl,'stsd');
 let codec=null,coded=null;
 if(stsd&&stsd.body+16<=stsd.end&&u32(view,stsd.body+4)>0){
  const entry=stsd.body+8;codec=text(bytes,entry+4);
  if(handler==='vide'&&entry+36<=stsd.end)coded={width:view.getUint16(entry+32),height:view.getUint16(entry+34)};
 }
 return {handler,codec,timescale,duration,display,coded};
}

export async function inspectMp4(file){
 if(!file?.size||file.size<16)throw problem('MP4 inválido: archivo vacío.');
 let at=0,count=0,ftyp=null,moov=null,mdatAt=null,fragmented=false;
 while(at<file.size){
  if(++count>MAX_TOP_BOXES)throw problem('MP4 inválido: estructura desconocida.');
  const head=await read(file,at,Math.min(16,file.size-at));if(head.length<8)throw problem('MP4 inválido: caja truncada.');
  const view=new DataView(head.buffer);let size=u32(view,0),header=8;const type=text(head,4);
  if(count===1&&type!=='ftyp')throw problem('No es un MP4: exporta el video como MPEG-4 (.mp4).');
  if(size===1){if(head.length<16)throw problem('MP4 inválido: caja truncada.');size=u64(view,8);header=16;}
  else if(size===0)size=file.size-at;
  if(size<header||at+size>file.size)throw problem('MP4 inválido: caja truncada.');
  if(type==='ftyp'){if(size>4096)throw problem('MP4 inválido: cabecera demasiado grande.');ftyp=await read(file,at,size);}
  else if(type==='moov'){if(moov)throw problem('MP4 inválido: índice duplicado.');if(size>MAX_MOOV)throw problem('MP4 inválido: índice demasiado grande.');moov={bytes:await read(file,at,size),at};}
  else if(type==='mdat'){if(mdatAt===null)mdatAt=at;}
  else if(type==='moof')fragmented=true;
  at+=size;
 }
 const brands=[];for(let i=8;i+4<=ftyp.length;i+=4)if(i!==12)brands.push(text(ftyp,i));
 if(brands[0]==='qt  '||!brands.some(brand=>MP4_BRANDS.has(brand)))throw problem('Es un video QuickTime (.mov): expórtalo como MPEG-4 (.mp4).');
 if(!moov)throw problem('MP4 inválido: falta el índice del video. Vuelve a exportarlo.');
 if(mdatAt===null)throw problem('MP4 inválido: no contiene imágenes.');
 const bytes=moov.bytes,root={body:8,end:bytes.length};
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const mvhd=find(bytes,root,'mvhd');if(!mvhd)throw problem('MP4 inválido: falta la duración.');
 const version=bytes[mvhd.body];
 const timescale=version===1?u32(view,mvhd.body+20):u32(view,mvhd.body+12);
 let duration=version===1?u64(view,mvhd.body+24):u32(view,mvhd.body+16);
 const tracks=all(bytes,root,'trak').map(trak=>trackInfo(bytes,trak)).filter(Boolean);
 const video=tracks.filter(track=>track.handler==='vide'),audio=tracks.filter(track=>track.handler==='soun');
 if(video.length!==1)throw problem(video.length?'El MP4 tiene varias pistas de video; exporta una sola.':'El MP4 no tiene pista de video.');
 if(audio.length>1)throw problem('El MP4 tiene varias pistas de audio; exporta una sola.');
 const [track]=video;
 let durationMs=timescale?Math.round(duration*1000/timescale):0;
 if(!durationMs&&track.timescale)durationMs=Math.round(track.duration*1000/track.timescale);
 if(fragmented||!durationMs)throw problem('MP4 fragmentado o sin duración: expórtalo como MP4 normal.');
 // Límite sobre los píxeles guardados (720p); el tamaño de presentación puede variar por la proporción de píxel.
 const width=track.coded?.width||track.display.width,height=track.coded?.height||track.display.height;
 if(!width||!height)throw problem('MP4 inválido: sin tamaño de imagen.');
 const audioCodec=audio[0]?.codec||null;
 if(audioCodec&&!['mp4a','Opus'].includes(audioCodec))throw problem('El audio no se puede reproducir en el navegador: expórtalo en AAC.');
 return {verification:'mp4',width,height,duration_ms:durationMs,video_codec:track.codec,audio_codec:audioCodec,faststart:moov.at<mdatAt};
}
