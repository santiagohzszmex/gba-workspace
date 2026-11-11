// Workspace 1.8.0 Labradorita · Pegado limpio desde Word, Google Docs y Pages, y Markdown al escribir y pegar.
// Pages: muestra real en formato Cocoa (el de Pages y TextEdit), hecha con textutil. Word y Google Docs: estructura que
// esos programas ponen en el portapapeles. La misma limpieza se probó en el editor real con eventos de pegado.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DOMParser} from 'linkedom';
import {cleanPastedHtml,detectSource,looksLikeMarkdown,markdownToHtml} from '../src/workspace/pasteCleanup.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};const ok=(v,m)=>{assert.ok(v,m);checks++;};
const fixture=name=>fs.readFile(new URL(`./fixtures/paste/${name}.html`,import.meta.url),'utf8');
const clean=html=>cleanPastedHtml(html,{DOMParser});
const body=result=>result.html.replace(/>\s+</g,'><');

const word=clean(await fixture('word-mac'));
eq([word.source,word.removedImages],['word',1]);
eq(body(word),'<h1>La luz que permanece</h1><h2>Primera parte</h2><p>Un párrafo con <strong>negrita</strong>, <em>cursiva</em>, <u>subrayado</u> y <s>tachado</s>. Texto en rojo normal.</p><ul><li>Primer punto<ul><li>Punto anidado</li></ul></li><li>Segundo punto</li></ul><ol><li>Paso uno</li><li>Paso dos</li></ol><p style="text-align: center">Texto centrado</p><table><tr><td><p><strong>Nombre</strong></p></td><td><p>Valor</p></td></tr></table><p><a href="https://gba.software/">Enlace</a> y enlace peligroso</p>');
const docs=clean(await fixture('google-docs'));
eq([docs.source,docs.removedImages],['google',1]);
eq(body(docs),'<h1>La luz que permanece</h1><h2>Primera parte</h2><p>Un párrafo con <strong>negrita</strong>, <em>cursiva</em> y <u>subrayado</u>. Más texto del párrafo para que sea el tamaño más usado en el documento.</p><ul><li><p>Primer punto</p><ul><li><p>Punto anidado</p></li></ul></li><li><p>Segundo punto</p></li></ul><p style="text-align: center">Texto centrado</p><p><a href="https://gba.software/">Enlace</a></p>');
const pages=clean(await fixture('apple-textutil'));
eq([pages.source,pages.removedImages],['apple',0]);
eq(body(pages),'<h1>La luz que permanece</h1><h2>Primera parte</h2><p>Un párrafo con <strong>negrita</strong>, <em>cursiva</em> y <u>subrayado</u>.</p><ul><li>Primer punto</li><li>Segundo punto</li></ul><p style="text-align: center">Texto centrado</p>');
// Nada de lo que trae cada programa sobrevive: fuentes, tamaños, colores, clases ni código.
for(const result of [word,docs,pages]){
 ok(!/class=|font-|color|mso|lang=|<span|<font|<o:p|<img|<b>|<i>|style="(?!text-align: (center|right|justify)")/i.test(result.html),result.source);
}
// Seguridad: sólo enlaces http(s) o mailto; sin scripts ni manejadores.
const hostile=clean('<p onclick="x()">Hola <a href="javascript:alert(1)">uno</a> <a href=" https://ok.example/ ">dos</a> <a href="mailto:a@b.co">tres</a><script>alert(1)</script><iframe src="https://x"></iframe></p>');
eq(hostile.html,'<p>Hola uno <a href="https://ok.example/">dos</a> <a href="mailto:a@b.co">tres</a></p>');
eq(detectSource('<p>simple</p>'),'web');eq(body(clean('<h5>Muy chico</h5><div>Bloque</div><p>&nbsp;</p><p><br></p>')),'<h3>Muy chico</h3><p>Bloque</p>');
eq(clean('<table><tr><td colspan="2" rowspan="1" width="9">x</td></tr></table>').html,'<table><tbody><tr><td colspan="2">x</td></tr></tbody></table>'.replace('<tbody>','').replace('</tbody>',''));

// Markdown pegado: se reconoce sin confundir texto normal, y no deja pasar HTML.
eq(['# Título','- uno\n- dos','1. paso','> cita','Texto **negrita**','[GBA](https://gba.software)','```\ncódigo\n```','Hola, esto es texto normal.','Un * suelto y 3 * 4 = 12','Precio: $5'].map(looksLikeMarkdown),[true,true,true,true,true,true,true,false,false,false]);
const md=clean(markdownToHtml('# Título\n\nTexto con **negrita**, *cursiva* y ~~tachado~~.\n\n- uno\n- dos\n\n1. primero\n\n> cita\n\n[GBA](https://gba.software) <script>x</script> [mal](javascript:alert(1))'));
eq(body(md),'<h1>Título</h1><p>Texto con <strong>negrita</strong>, <em>cursiva</em> y <s>tachado</s>.</p><ul><li>uno</li><li>dos</li></ul><ol><li>primero</li></ol><blockquote><p>cita</p></blockquote><p><a href="https://gba.software">GBA</a> &lt;script&gt;x&lt;/script&gt; mal</p>');

// Editor: limpieza en todo pegado HTML, Markdown al pegar texto plano (o de editores de código) y al escribir.
const rich=await fs.readFile('src/workspace/RichDocument.jsx','utf8');
ok(/transformPastedHTML:html=>\{const cleaned=cleanPastedHtml\(html\)/.test(rich));
ok(/looksLikeMarkdown\(plain\)&&\(!html\|\|\/white-space/.test(rich)&&/view\.pasteHTML\(markdownToHtml\(plain\)\)/.test(rich));
ok(/heading:\{levels:\[1,2,3\]\}/.test(rich),'los atajos de Markdown sólo crean los tres niveles de título del editor');
ok(/StarterKit\.configure/.test(rich)&&!/enableInputRules:\s*false/.test(rich),'atajos de Markdown al escribir activos');
ok(/imágenes no se copian/.test(rich)&&/Markdown: \*\*negrita\*\*/.test(rich));
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));ok(pkg.devDependencies.linkedom&&!pkg.dependencies?.linkedom,'linkedom sólo para pruebas');
console.log(`PASS: ${checks} comprobaciones de pegado limpio y Markdown (Word, Google Docs, Pages, web y texto).`);
