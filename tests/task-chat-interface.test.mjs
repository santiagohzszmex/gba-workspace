// Workspace 1.8.0 Labradorita · Conversación tipo chat en cada asignación (sin navegador).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {build} from 'esbuild';
import {CHAT_KINDS,chatMessages,chatTime,hasContent,sameMessages} from '../src/workspace/chatModel.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};const ok=(v,m)=>{assert.ok(v,m);checks++;};

// Orden de chat: el más reciente abajo; sólo la asignación pedida.
const rows=[{id:'b',deliverable_id:'t1',created_at:'2026-11-11T18:02:00Z'},{id:'a',deliverable_id:'t1',created_at:'2026-11-11T18:01:00Z'},{id:'x',deliverable_id:'t2',created_at:'2026-11-11T18:00:00Z'},{id:'c',deliverable_id:'t1',created_at:'2026-11-11T18:02:00Z'}];
eq(chatMessages(rows,'t1').map(r=>r.id),['a','b','c']);eq(chatMessages(undefined,'t1'),[]);
// Hora: hoy sólo la hora; ayer «Ayer»; antes la fecha corta.
const now=new Date(2026,10,11,18,0);
ok(!/Ayer|nov/.test(chatTime(new Date(2026,10,11,9,5),now))&&/9:05/.test(chatTime(new Date(2026,10,11,9,5),now)));
ok(/^Ayer, /.test(chatTime(new Date(2026,10,10,22,0),now)));
ok(/^2 nov, /.test(chatTime(new Date(2026,10,2,10,0),now)));ok(/2025/.test(chatTime(new Date(2025,0,3,10,0),now)));eq(chatTime('no',now),'');
// Se envía con texto o con una imagen; no vacío.
const doc=content=>({type:'doc',content});
eq([hasContent(doc([{type:'paragraph',content:[{type:'text',text:'  '}]}])),hasContent(doc([{type:'paragraph',content:[{type:'text',text:'Hola'}]}])),hasContent(doc([{type:'originalImage',attrs:{assetId:'1'}}])),hasContent(null)],[false,true,true,false]);
eq([sameMessages([{id:'a',body:'x'}],[{id:'a',body:'x'}]),sameMessages([{id:'a',body:'x'}],[{id:'a',body:'y'}]),sameMessages([],[{id:'a'}])],[true,false,false]);
eq(Object.keys(CHAT_KINDS),['comment','changes','verified','qa_issue']);

const folder=await fs.mkdtemp(path.resolve('release-candidates','labradorita-chat-ui-'));
try{
 await build({stdin:{contents:"export {default as WorkConversation} from './src/workspace/WorkConversation.jsx';export {DocumentContext} from './src/workspace/DocumentContext.jsx';",resolveDir:process.cwd(),sourcefile:'chat-entry.jsx',loader:'jsx'},outfile:path.join(folder,'chat.js'),bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty','.png':'dataurl'},define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_ANON_KEY:'fixture-local-only',DEV:false})},logLevel:'error'});
 const {WorkConversation,DocumentContext}=await import(pathToFileURL(path.join(folder,'chat.js')));
 const render=(props,actorId='u1')=>renderToStaticMarkup(React.createElement(DocumentContext.Provider,{value:{actorId,originals:{},candidates:async()=>[]}},React.createElement(WorkConversation,props)));
 const task={id:'t1',project_id:'p1',area_id:'a1',revision:3};
 const comments=[{id:'c2',deliverable_id:'t1',kind:'changes',body:'Corrige la portada',actor_id:'u2',version_number:1,created_at:'2026-11-11T18:02:00Z'},{id:'c1',deliverable_id:'t1',kind:'comment',body:'Hola',actor_id:'u1',version_number:1,created_at:'2026-11-11T18:01:00Z'},{id:'c3',deliverable_id:'t1',kind:'qa_issue',body:'Falta crédito',actor_id:'u3',version_number:1,created_at:'2026-11-11T18:03:00Z'}];
 const data={comments,members:[{user_id:'u2',display_name:'Responsable'},{user_id:'u3',display_name:'QA'}],taskPermissions:{t1:{'content.comment':true,'qa.raise_issue':true}}};
 const html=render({task,data,command:async()=>null,busy:false});
 ok(/aria-label="Conversación de la asignación"/.test(html)&&/<h3>Conversación<\/h3>/.test(html));
 ok(html.indexOf('Hola')<html.indexOf('Corrige la portada')&&html.indexOf('Corrige la portada')<html.indexOf('Falta crédito'),'orden cronológico');
 ok(/data-own="true" data-kind="comment"/.test(html)&&/<strong>Tú<\/strong>/.test(html)&&/<strong>Responsable<\/strong>/.test(html));
 ok(/Correcciones solicitadas/.test(html)&&/Incidencia de calidad/.test(html)&&/data-kind="changes"/.test(html));
 ok(/Enter envía/.test(html)&&/Enviar<\/button>/.test(html)&&/Reportar un problema con la entrega/.test(html));
 ok(!/<details class="gw-work-conversation"/.test(html),'ya no está escondida en un pliegue');
 // Sin permiso de comentar: sólo lectura. En producciones cerradas (sin comandos) tampoco se escribe.
 const reader=render({task,data:{...data,taskPermissions:{t1:{}}},busy:false,command:async()=>null});ok(/Corrige la portada/.test(reader)&&!/Enter envía|Reportar un problema/.test(reader));
 const closed=render({task,data,busy:false});ok(/Corrige la portada/.test(closed)&&!/Enter envía|Reportar un problema/.test(closed));
 eq(render({task,data:{...data,comments:[],taskPermissions:{t1:{}}},busy:false}),'');
 ok(/Todavía no hay mensajes/.test(render({task,data:{...data,comments:[]},command:async()=>null,busy:false})));
}finally{await fs.rm(folder,{recursive:true,force:true});}

// Editor: Enter envía salvo con la lista de menciones abierta; capturas pegadas sólo en la conversación.
const [rich,view,editor,work,css,placement]=await Promise.all(['src/workspace/RichDocument.jsx','src/views/Workspace.jsx','src/workspace/WorkEditor.jsx','src/workspace/EditionWork.jsx','src/workspace/taskChat.css','src/workspace/editorPlacement.js'].map(f=>fs.readFile(f,'utf8')));
ok(/live\.current\.onSubmit && event\.key==='Enter' && !event\.shiftKey/.test(rich)&&/!mentionOpen\(_view\)/.test(rich));
ok(/handlePaste:/.test(rich)&&/getData\('text\/html'\)\|\|event\.clipboardData\.getData\('text\/plain'\)/.test(rich)&&/scope\.attachments&&context\.uploadImage/.test(rich));
ok(/scope\.kind==='comment'&&!scope\.attachments/.test(rich),'comentarios normales siguen sin subir imágenes');
ok(/scope\.attachments\?'conversation':'document_image'/.test(view)&&/syncComments:async taskId=>/.test(view)&&/if\(action!=='comment\.add'\)setNotice/.test(view));
ok(/<WorkConversation task=\{task\}[^>]*\/>\n      <\/aside>/.test(editor),'junto al documento');
ok((work.match(/<WorkConversation task=\{selected\}/g)||[]).length>=3,'también en entregas de imagen y video');
// La lista de menciones no se cierra por falta de espacio: el desplazamiento está en el texto, no en sus contenedores.
ok(/\.gw-writing-paper \.tiptap\{max-height:180px;overflow-y:auto\}/.test(css)&&!/\.gw-chat-composer \.gw-writing-paper\{[^}]*overflow/.test(css));
ok(/for \(let parent = element\.parentElement/.test(placement));
console.log(`PASS: ${checks} comprobaciones de la conversación tipo chat.`);
