import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {build} from 'esbuild';
import {PRODUCTION_KINDS,productionKind,isVideoProduction,productionNoun} from '../src/workspace/productionKinds.mjs';

// Workspace 1.8.0 Labradorita · tipos de producción en la interfaz.
assert.deepEqual(Object.keys(PRODUCTION_KINDS),['publication','video']);
assert.equal(productionKind({}),'publication');assert.equal(productionKind({kind:'video'}),'video');assert.equal(productionKind({kind:'otro'}),'publication');
assert.equal(isVideoProduction({kind:'video'}),true);assert.equal(isVideoProduction({kind:'publication'}),false);assert.equal(isVideoProduction(null),false);
assert.equal(productionNoun({kind:'video'}),'producción');assert.equal(productionNoun({kind:'publication'}),'edición');assert.equal(productionNoun(undefined),'edición');

const folder=await fs.mkdtemp(path.resolve('release-candidates','labradorita-ui-'));
try{
 await build({entryPoints:['src/workspace/WorkspaceNavigation.jsx','src/workspace/ProductionsAdmin.jsx'],outdir:folder,bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty','.png':'dataurl'},define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_ANON_KEY:'fixture-local-only',DEV:false})}});
 const {WorkspaceNavigation,EditionTabs,EditionNavigation}=await import(pathToFileURL(path.join(folder,'WorkspaceNavigation.js')));
 const render=(c,p)=>renderToStaticMarkup(React.createElement(c,p));
 const tabs=render(EditionTabs,{projects:[{id:'a',title:'Revista de noviembre',status:'active',kind:'publication'},{id:'b',title:'Corto de la mascota',status:'active',kind:'video'}],selectedId:'b'});
 assert.match(tabs,/>Producciones</);assert.match(tabs,/Corto de la mascota<small>Video<\/small>/);assert.doesNotMatch(tabs,/Revista de noviembre<small>/);
 const nav=render(WorkspaceNavigation,{screen:'editions',context:{},onScreenChange:()=>{}});assert.match(nav,/Producciones/);assert.doesNotMatch(nav,/>Ediciones</);
 assert.match(render(EditionNavigation,{section:'documents',onSelect:()=>{},canWork:true}),/aria-label="Trabajo de la producción"/);
 // Administrar producciones: lista agrupada por estado, con tipo y fechas, y creación por tipo.
 const admin=await import(pathToFileURL(path.join(folder,'ProductionsAdmin.js')));
 const projects=[{id:'p1',title:'Revista de noviembre',status:'active',kind:'publication',starts_at:'2026-11-01T06:00:00Z',ends_at:'2026-11-30T06:00:00Z',revision:3},
  {id:'p2',title:'Corto de la mascota',status:'planned',kind:'video',revision:1},
  {id:'p3',title:'Especial de octubre',status:'closed',kind:'publication',revision:9},
  {id:'p4',title:'Archivo 2025',status:'archived',kind:'publication',revision:2}];
 assert.deepEqual(admin.groupProductions(projects).map(g=>[g.id,g.items.map(x=>x.id)]),[['current',['p1','p2']],['closed',['p3']],['archived',['p4']]]);
 assert.deepEqual(admin.groupProductions([]).map(g=>g.items.length),[0,0,0]);
 const full={'project.create':true,'project.update':true,'project.archive':true};
 const page=render(admin.default,{projects,permissions:full,command:async()=>null,busy:false,removed:[{id:'r1',title:'Prueba vieja',deleted_at:'2026-10-01',deletion_reason:'Duplicada',revision:1}],onRemove:async()=>{},onRestore:async()=>{}});
 assert.match(page,/<h2[^>]*>Producciones<\/h2>/);assert.match(page,/Nueva producción/);
 assert.match(page,/En curso[^<]*<[^>]*>2</);assert.match(page,/Cerradas[^<]*<[^>]*>1</);assert.match(page,/Archivadas[^<]*<[^>]*>1</);
 assert.match(page,/Corto de la mascota/);assert.match(page,/Video y animación/);assert.match(page,/Publicación editorial/);assert.match(page,/Planeada/);
 assert.equal((page.match(/>Editar</g)||[]).length,4);
 assert.match(page,/Producciones eliminadas/);assert.match(page,/Restaurar/);
 assert.doesNotMatch(page,/Seleccionar edición|Edición para administrar|<details/);
 const reader=render(admin.default,{projects,permissions:{},command:async()=>null,busy:false,removed:[],onRemove:async()=>{},onRestore:async()=>{}});
 assert.doesNotMatch(reader,/Nueva producción|>Editar</);
 // Sin producciones cerradas ni archivadas, esos grupos no aparecen; «En curso» siempre.
 const onlyCurrent=render(admin.default,{projects:[projects[0]],permissions:full,command:async()=>null,busy:false,removed:[],onRemove:async()=>{},onRestore:async()=>{}});
 assert.match(onlyCurrent,/En curso/);assert.doesNotMatch(onlyCurrent,/Cerradas|Archivadas|Producciones eliminadas/);
 assert.match(render(admin.default,{projects:[],permissions:full,command:async()=>null,busy:false,removed:[],onRemove:async()=>{},onRestore:async()=>{}}),/No hay producciones en curso/);
 // Crear: primero el tipo, con sus áreas a la vista; después nombre y fechas.
 const chooser=render(admin.NewProduction,{busy:false,onCreate:async()=>{},onCancel:()=>{}});
 assert.match(chooser,/¿Qué vas a producir\?/);assert.match(chooser,/Guion/);assert.match(chooser,/Animación 3D/);assert.match(chooser,/Diseño y maquetación/);assert.doesNotMatch(chooser,/Crear producción/);
 const details=render(admin.NewProduction,{busy:false,onCreate:async()=>{},onCancel:()=>{},initialKind:'video'});
 assert.match(details,/Video y animación/);assert.match(details,/Crear producción/);assert.match(details,/Cambiar tipo/);
}finally{await fs.rm(folder,{recursive:true,force:true});}

// Configuración usa la nueva pestaña y ya no tiene su propio selector de edición para administrar.
const settings=await fs.readFile('src/workspace/WorkspaceSettings.jsx','utf8');
assert.match(settings,/Administrar producciones/);assert.match(settings,/<ProductionsAdmin /);assert.doesNotMatch(settings,/Edición para administrar/);
console.log('PASS: production kinds in the interface: labels, video tag, production admin list, grouping and creation by type.');
