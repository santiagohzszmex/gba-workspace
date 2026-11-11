// R2 en memoria para pruebas de la pasarela (mismo comportamiento que el de las pruebas de Lapislázuli).
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function digestFactory(){let resolve,reject;const hash=createHash('sha256'),stream=new WritableStream({write(bytes){hash.update(bytes);},close(){resolve(hash.digest());},abort(error){reject(error);}});stream.digest=new Promise((a,b)=>{resolve=a;reject=b;});return stream;}
export class Bucket{
 objects=new Map();uploads=new Map();created=0;written=0;reads=0;failDelete=false;
 obj(key,bytes,metadata={}){return {key,size:bytes.length,body:new Blob([bytes]).stream(),...metadata,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};}
 async put(key,body){const bytes=Buffer.from(await new Response(body).arrayBuffer());this.objects.set(key,bytes);return this.obj(key,bytes);}
 async head(key){const b=this.objects.get(key);return b?this.obj(key,b):null;}
 async get(key,opts={}){this.reads++;let b=this.objects.get(key);if(!b)return null;const full=b;if(opts.range)b=b.subarray(opts.range.offset,opts.range.offset+opts.range.length);return this.obj(key,b,{size:full.length});}
 async delete(key){if(this.failDelete)throw Error('R2 unavailable');this.objects.delete(key);}
 async createMultipartUpload(key){const id=webcrypto.randomUUID();this.created++;this.uploads.set(id,{key,parts:new Map()});return this.resumeMultipartUpload(key,id);}
 resumeMultipartUpload(key,id){const get=()=>{const value=this.uploads.get(id);if(!value||value.key!==key)throw Object.assign(Error('NoSuchUpload'),{code:'NoSuchUpload'});return value;};return {uploadId:id,
  uploadPart:async(n,body)=>{const value=get(),bytes=Buffer.from(await new Response(body).arrayBuffer()),etag=sha(bytes);value.parts.set(n,{bytes,etag});this.written++;return {partNumber:n,etag};},
  // Como R2: un objeto multipart no trae SHA-256 del archivo completo.
  complete:async parts=>{const value=get();const bytes=Buffer.concat(parts.map(p=>{const part=value.parts.get(p.partNumber);assert.equal(part.etag,p.etag);return part.bytes;}));this.objects.set(key,bytes);this.uploads.delete(id);return this.obj(key,bytes);},
  abort:async()=>{get();this.uploads.delete(id);}
 };}
}
