// Workspace 1.8.0 Labradorita · Video en la interfaz: lógica, ajuste de Blender y pantallas (sin navegador).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {build} from 'esbuild';
import {BLENDER_SCRIPT,DEFAULT_POLICY,DRAW_COLORS,VIDEO_NETWORKS,formatTime,networkFromUrl,noteStatus,purgeLabel,simplifyStroke,uploadMessage,validPublicationUrl,videoNotes,videoProblem} from '../src/workspace/video/videoModel.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};const ok=(v,m)=>{assert.ok(v,m);checks++;};

// Tiempos.
eq([formatTime(0),formatTime(42000),formatTime(62500,{precise:true}),formatTime(3723000),formatTime(-5)],['0:00','0:42','1:02.5','1:02:03','0:00']);
// Límites locales: mismos que el servidor, con la solución en el mensaje.
eq(videoProblem({name:'corte.mp4',size:1000,width:1280,height:720,durationMs:30000}),'');
eq(videoProblem({name:'vertical.mp4',size:1000,width:720,height:1280,durationMs:1000}),'');
ok(/QuickTime/.test(videoProblem({name:'corte.mov',size:1}))&&/MP4/.test(videoProblem({name:'corte.avi',size:1})));
ok(/720p/.test(videoProblem({name:'a.mp4',size:1,width:1920,height:1080})));
ok(/300 MB/.test(videoProblem({name:'a.mp4',size:400*1048576})));
ok(/10 minutos/.test(videoProblem({name:'a.mp4',size:1,width:1280,height:720,durationMs:601000})));
eq(videoProblem({name:'a.mp4',size:1,width:1920,height:1080},{max_long_side:1920,max_short_side:1080}),'');
ok(/continuar/.test(uploadMessage(Object.assign(Error('x'),{name:'AbortError'})))&&/conexión/.test(uploadMessage(Error('Failed to fetch'))));
// Trazos: coordenadas dentro del cuadro, sin repetidos y con máximo de puntos.
eq(simplifyStroke([[0.1,0.1],[0.1,0.1],[1.5,-1],[0.123456,0.5]]),[[0.1,0.1],[1,0],[0.1235,0.5]]);
eq(simplifyStroke(Array.from({length:2000},(_,i)=>[i/2000,0.5])).length,500);
eq(DRAW_COLORS.map(c=>c[0]),['#e5484d','#f5d90a','#30a46c','#0091ff','#ffffff','#111111']);
// Comentarios: los de versiones anteriores aparecen con su estado; los posteriores no.
const versions=[{id:'v1',version_number:1},{id:'v2',version_number:2}];
const bundle={notes:[{id:'n2',version_id:'v2',time_ms:500,created_at:'2'},{id:'n1',version_id:'v1',time_ms:9000,created_at:'1'},{id:'n0',version_id:'v1',time_ms:100,created_at:'0'}],resolutions:[{note_id:'n1',verified_version_id:'v2',resolved:true}]};
eq(videoNotes(bundle,versions,versions[0]).map(n=>[n.id,n.resolved]),[['n0',false],['n1',false]]);
const atV2=videoNotes(bundle,versions,versions[1]);
eq(atV2.map(n=>[n.id,n.previous,noteStatus(n)]),[['n0',true,'Abierto'],['n1',true,'Atendido en v2'],['n2',false,'Abierto']]);
// Publicaciones.
eq(['https://www.instagram.com/reel/x','https://vm.tiktok.com/x','https://youtu.be/x','https://fb.watch/x','https://x.com/gimg/status/1','https://www.threads.net/@gimg','https://vimeo.com/1','nada'].map(networkFromUrl),['instagram','tiktok','youtube','facebook','x','threads','other',null]);
eq(Object.keys(VIDEO_NETWORKS),['instagram','tiktok','youtube','facebook','x','threads','other']);
eq([validPublicationUrl('https://www.tiktok.com/@gimg/video/1'),validPublicationUrl('http://www.tiktok.com/x'),validPublicationUrl('https://localhost'),validPublicationUrl('https://a.com/ b')],[true,false,false,false]);
eq(purgeLabel({purged:true}).includes('se borró'),true);
eq(purgeLabel({purge_due_at:new Date(Date.now()+47.6*3600000).toISOString()}),'Esta copia se borrará en 2 días, porque el video ya se publicó.');
eq(purgeLabel({purge_due_at:new Date(Date.now()+3*3600000).toISOString()}),'Esta copia se borrará en 3 horas, porque el video ya se publicó.');
eq(purgeLabel({}),'');eq(DEFAULT_POLICY.max_bytes,314572800);

// Ajuste de Blender: Python válido, MP4 H.264 + AAC, 720p como máximo y compatible con la salida de video de Blender 5.
for(const needle of ["f.format = 'MPEG4'","f.codec = 'H264'","f.audio_codec = 'AAC'","LONG, SHORT = 1280, 720","hasattr(settings, \"media_type\")","w % 2 == 0 and h % 2 == 0","seconds > 600"])ok(BLENDER_SCRIPT.includes(needle),needle);
let python='omitido (sin python3)';
try{execFileSync('python3',['-c','import ast,sys;ast.parse(sys.stdin.read())'],{input:BLENDER_SCRIPT});python='ok';checks++;}catch(error){if(error.code!=='ENOENT')throw error;}
// El cálculo de porcentaje da un tamaño par y dentro de 720p para escenas comunes (misma regla que el script).
const pick=(w,h)=>{for(let p=100;p>0;p--){const a=Math.floor(w*p/100),b=Math.floor(h*p/100);if(Math.max(a,b)<=1280&&Math.min(a,b)<=720&&a%2===0&&b%2===0)return [p,a,b];}};
eq([pick(1920,1080),pick(1080,1920),pick(3840,2160),pick(1280,720),pick(1080,1080)],[[65,1248,702],[65,702,1248],[30,1152,648],[100,1280,720],[66,712,712]]);

// Pantallas.
const folder=await fs.mkdtemp(path.resolve('release-candidates','labradorita-video-ui-'));
try{
 await build({entryPoints:['src/workspace/video/VideoReview.jsx','src/workspace/video/VideoDelivery.jsx','src/workspace/video/VideoPublications.jsx','src/workspace/video/VideoKindForm.jsx'],outdir:folder,bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty','.png':'dataurl'},define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_ANON_KEY:'fixture-local-only',DEV:false})},logLevel:'error'});
 const load=async name=>import(pathToFileURL(path.join(folder,`${name}.js`)));
 const render=(c,p)=>renderToStaticMarkup(React.createElement(c,p));
 const [{default:VideoReview},{default:VideoDelivery},{default:VideoPublications},{default:VideoKindForm}]=await Promise.all(['VideoReview','VideoDelivery','VideoPublications','VideoKindForm'].map(load));
 const api=async()=>({available:true,url:'https://gateway.invalid/x'});
 const task={id:'t1',project_id:'p1',area_id:'a1',title:'Entrada de la mascota',kind:'video',state:'review',current_version:2,revision:4,round:0,extra_rounds:0,responsible_id:'u2',collaborator_ids:[]};
 const video={enabled:true,uploads_enabled:true,policy:DEFAULT_POLICY,reviewer:{t1:true},
  assets:{as1:{id:'as1',deliverable_id:'t1',file_name:'v1.mp4',size_bytes:5e6,width:1280,height:720,duration_ms:12000,purged:true},as2:{id:'as2',deliverable_id:'t1',file_name:'v2.mp4',size_bytes:5e6,width:1280,height:720,duration_ms:12000,audio_codec:'mp4a'}},
  versions:{v1:{version_id:'v1',deliverable_id:'t1',version_number:1,asset_id:'as1',duration_ms:12000,author_id:'u2',change_summary:'Primer pase',note:'',created_at:'2026-11-09'},v2:{version_id:'v2',deliverable_id:'t1',version_number:2,asset_id:'as2',duration_ms:12000,author_id:'u2',change_summary:'Más lento',note:'Ajusté la entrada',created_at:'2026-11-10'}},
  notes:[{id:'n1',version_id:'v1',author_id:'u3',time_ms:2400,body:'Entra muy rápido',drawing:[{color:'#e5484d',width:4,points:[[0.1,0.1],[0.2,0.2]]}],created_at:'2026-11-09'}],replies:[],resolutions:[],publications:[],has_approved_video:false,publish_task_id:null};
 const data={video,members:[{user_id:'u2',display_name:'Animación'},{user_id:'u3',display_name:'Responsable'}],areas:[{id:'a1',name:'Animación 3D',specialty:'animation_3d'}],projects:[{id:'p1',title:'Corto',kind:'video'}],tasks:[task],taskPermissions:{t1:{'content.comment':true,'review.request_changes':true,'content.edit_assigned':false}}};
 const review=render(VideoReview,{task,data,actorId:'u3',api,command:async()=>null,busy:false});
 ok(/aria-label="Revisión de video"/.test(review)&&/v2 · Actual/.test(review)&&/Comparar con/.test(review));
 ok(/Comentar en este momento/.test(review)&&/Dibujar sobre el cuadro/.test(review)&&/Pedir cambios/.test(review));
 ok(/0:02<\/span>/.test(review)&&/De v1 · Abierto · Con dibujo/.test(review)&&/Entra muy rápido/.test(review));
 ok(/aria-label="Comentario en 0:02"/.test(review),'marca en la línea de tiempo');
 // Quien no revisa (la persona asignada) ve el video y los comentarios, pero no publica comentarios ni pide cambios.
 const asAuthor=render(VideoReview,{task,data:{...data,video:{...video,reviewer:{t1:false}},taskPermissions:{t1:{'content.comment':true}}},actorId:'u2',api,command:async()=>null,busy:false});
 ok(!/Comentar en este momento|Pedir cambios/.test(asAuthor)&&/Entra muy rápido/.test(asAuthor));
 const closed=render(VideoReview,{task,data,actorId:'u3',api,busy:false,readOnly:true});ok(!/Comentar en este momento|Pedir cambios/.test(closed));
 ok(/no hay una versión de video/.test(render(VideoReview,{task:{...task,id:'t9'},data,actorId:'u3',api,busy:false})));
 ok(/no están habilitadas/.test(render(VideoReview,{task,data:{...data,video:{enabled:false}},actorId:'u3',api,busy:false})));
 // Entrega: requisitos, ajuste de Blender y botón deshabilitado hasta subir.
 const mine={...task,id:'t2',state:'assigned',current_version:0,responsible_id:'u2'};
 const delivery=render(VideoDelivery,{task:mine,data:{...data,tasks:[mine],taskPermissions:{t2:{'content.edit_assigned':true}}},actorId:'u2',api,command:async()=>null,busy:false});
 ok(/MP4 \(H\.264\), hasta 720p, 10 minutos y 300 MB/.test(delivery)&&/Descargar ajuste de Blender/.test(delivery)&&/Elegir video/.test(delivery));
 ok(/<button type="button" class="gw-primary" disabled="">Enviar a revisión/.test(delivery),'sin video no se envía');
 const off=render(VideoDelivery,{task:mine,data:{...data,video:{...video,uploads_enabled:false},tasks:[mine],taskPermissions:{t2:{'content.edit_assigned':true}}},actorId:'u2',api,busy:false});
 ok(/no hay una versión de video enviada/i.test(off)&&!/Elegir video/.test(off));
 // Publicaciones: sólo en producciones de video; el formulario aparece con un video aprobado.
 const project={id:'p1',kind:'video'};
 ok(/cuando un video de esta producción esté aprobado/.test(render(VideoPublications,{project,data:{...data,video:{...video,publish_task_id:'t1'}},api,busy:false})));
 const pubs=render(VideoPublications,{project,data:{...data,video:{...video,publish_task_id:'t1',has_approved_video:true,publications:[{id:'x',network:'tiktok',url:'https://www.tiktok.com/@gimg/video/1',published_at:'2026-11-11T18:00:00Z',author_id:'u2'}]}},actorId:'u2',api,busy:false});
 ok(/Registrar publicación/.test(pubs)&&/rel="noopener noreferrer"/.test(pubs)&&/TikTok/.test(pubs)&&/Quitar registro de TikTok/.test(pubs));
 ok(!/Registrar publicación/.test(render(VideoPublications,{project,data:{...data,video:{...video,has_approved_video:true}},api,busy:false})),'sin permiso no hay formulario');
 eq(render(VideoPublications,{project:{id:'p9',kind:'publication'},data,api,busy:false}),'');
 // Tipo de entrega: sólo en producciones de video y nunca sobre una imagen.
 const kind=render(VideoKindForm,{task:{...mine,kind:'document'},project,video,api,busy:false,editable:true});
 ok(/Qué se entrega/.test(kind)&&/Documento/.test(kind)&&/Copia de revisión en MP4/.test(kind));
 eq(render(VideoKindForm,{task:mine,project:{kind:'publication'},video,api,busy:false,editable:true}),'');
 eq(render(VideoKindForm,{task:{...mine,kind:'image'},project,video,api,busy:false,editable:true}),'');
 ok(/se fija con la primera versión/.test(render(VideoKindForm,{task:{...mine,current_version:1},project,video,api,busy:false,editable:true})));
}finally{await fs.rm(folder,{recursive:true,force:true});}

// Conexión con las pantallas existentes.
const source=async f=>fs.readFile(f,'utf8');
const [work,reviews,closedView,view,css,tauri]=await Promise.all(['src/workspace/EditionWork.jsx','src/workspace/EditionReviews.jsx','src/workspace/ClosedEdition.jsx','src/views/Workspace.jsx','src/workspace/video/video.css','src-tauri/tauri.conf.json'].map(source));
ok(/selected\.kind==='video' \? (<>)?<VideoDelivery/.test(work)&&/<VideoKindForm/.test(work)&&/<VideoPublications/.test(work));
ok(/selected\.kind==='video'&&<VideoReview/.test(reviews)&&/hidden=\{\['image','video'\]\.includes\(selected\.kind\)\}/.test(reviews));
ok(/task\.kind==='video'\?<VideoReview[^>]*readOnly/.test(closedView));
ok(/id && videoProject \? rpc\('workspace_video_bundle'/.test(view)&&/rpc\('workspace_video_command'/.test(view));
ok(/media-src 'self' blob: https:\/\/\*\.workers\.dev/.test(tauri));
ok(!/@import|url\(http/.test(css));
console.log(`PASS: ${checks} comprobaciones de video en la interfaz (Python del ajuste de Blender: ${python}).`);
