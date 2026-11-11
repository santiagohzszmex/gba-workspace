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
 await build({entryPoints:['src/workspace/WorkspaceNavigation.jsx'],outdir:folder,bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty','.png':'dataurl'}});
 const {WorkspaceNavigation,EditionTabs,EditionNavigation}=await import(pathToFileURL(path.join(folder,'WorkspaceNavigation.js')));
 const render=(c,p)=>renderToStaticMarkup(React.createElement(c,p));
 const tabs=render(EditionTabs,{projects:[{id:'a',title:'Revista de noviembre',status:'active',kind:'publication'},{id:'b',title:'Corto de la mascota',status:'active',kind:'video'}],selectedId:'b'});
 assert.match(tabs,/>Producciones</);assert.match(tabs,/Corto de la mascota<small>Video<\/small>/);assert.doesNotMatch(tabs,/Revista de noviembre<small>/);
 const nav=render(WorkspaceNavigation,{screen:'editions',context:{},onScreenChange:()=>{}});assert.match(nav,/Producciones/);assert.doesNotMatch(nav,/>Ediciones</);
 assert.match(render(EditionNavigation,{section:'documents',onSelect:()=>{},canWork:true}),/aria-label="Trabajo de la producción"/);
}finally{await fs.rm(folder,{recursive:true,force:true});}

// El formulario de creación pide el tipo y lo envía en el comando.
const settings=await fs.readFile('src/workspace/WorkspaceSettings.jsx','utf8');
assert.match(settings,/Administrar producciones/);assert.match(settings,/Crear producción/);
assert.match(settings,/kind:\s*\{\s*label:\s*'Tipo de producción',\s*options:\s*PRODUCTION_KINDS\s*\}/);
console.log('PASS: production kinds in the interface: labels, video tag, creation form with type.');
