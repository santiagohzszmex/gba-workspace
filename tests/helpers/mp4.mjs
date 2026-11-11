// MP4 sintéticos para pruebas: cajas mínimas con la estructura real (ftyp, moov, mdat) sin imágenes decodificables.
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b;};
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b;};
const ascii=s=>Buffer.from(s,'latin1');
export const box=(type,...parts)=>{const body=Buffer.concat(parts.map(p=>Buffer.isBuffer(p)?p:Buffer.from(p)));return Buffer.concat([u32(8+body.length),ascii(type),body]);};
const matrix=Buffer.concat([u32(0x10000),u32(0),u32(0),u32(0),u32(0x10000),u32(0),u32(0),u32(0),u32(0x40000000)]);
function track({handler,codec,width=0,height=0,timescale,duration,id}){
 const tkhd=box('tkhd',u32(handler==='vide'?3:7),u32(0),u32(0),u32(id),u32(0),u32(duration),Buffer.alloc(8),u16(0),u16(0),u16(handler==='soun'?0x100:0),u16(0),matrix,u32(width*65536),u32(height*65536));
 const mdhd=box('mdhd',u32(0),u32(0),u32(0),u32(timescale),u32(duration),u16(0x55c4),u16(0));
 const hdlr=box('hdlr',u32(0),u32(0),ascii(handler),Buffer.alloc(12),Buffer.from([0]));
 const entry=handler==='vide'
  ?box(codec,Buffer.alloc(6),u16(1),Buffer.alloc(16),u16(width),u16(height),u32(0x480000),u32(0x480000),u32(0),u16(1),Buffer.alloc(32),u16(24),u16(0xffff))
  :box(codec,Buffer.alloc(6),u16(1),Buffer.alloc(8),u16(2),u16(16),u16(0),u16(0),u32(48000*65536));
 const stbl=box('stbl',box('stsd',u32(0),u32(1),entry));
 return box('trak',tkhd,box('mdia',mdhd,hdlr,box('minf',stbl)));
}
// Opciones: tamaño, duración, formatos, posición del índice (faststart), marca y fragmentación.
export function makeMp4({width=1280,height=720,durationMs=30000,codec='avc1',audio='mp4a',moovFirst=true,brand='isom',fragmented=false,mdatBytes=4096,videoTracks=1}={}){
 const timescale=1000,ftyp=box('ftyp',ascii(brand),u32(512),ascii(brand),ascii('iso2'),ascii('mp41'));
 const tracks=[];for(let i=0;i<videoTracks;i++)tracks.push(track({handler:'vide',codec,width,height,timescale,duration:durationMs,id:i+1}));
 if(audio)tracks.push(track({handler:'soun',codec:audio,timescale,duration:durationMs,id:videoTracks+1}));
 const moov=box('moov',box('mvhd',u32(0),u32(0),u32(0),u32(timescale),u32(fragmented?0:durationMs),u32(0x10000),u16(0x100),Buffer.alloc(10),matrix,Buffer.alloc(24),u32(videoTracks+2)),...tracks,...(fragmented?[box('mvex',box('trex',Buffer.alloc(24)))]:[]));
 const payload=Buffer.alloc(mdatBytes);for(let i=0;i<payload.length;i++)payload[i]=(i*31+7)&255;
 const mdat=box('mdat',payload),frag=fragmented?[box('moof',box('mfhd',u32(0),u32(1))),box('mdat',Buffer.alloc(16))]:[];
 return moovFirst?Buffer.concat([ftyp,moov,mdat,...frag]):Buffer.concat([ftyp,mdat,moov,...frag]);
}
// Archivo en memoria compatible con inspectMp4 (slice + arrayBuffer).
export const memoryFile=bytes=>({size:bytes.length,slice:(a,b)=>({arrayBuffer:async()=>Uint8Array.from(bytes.subarray(a,b)).buffer})});
