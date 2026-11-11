import './editorCompatibility';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, useEditorState, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { micromark } from 'micromark';
import { cleanPastedHtml, looksLikeMarkdown, markdownToHtml } from './pasteCleanup.mjs';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Undo2, Redo2, Link2, Highlighter, MoreHorizontal, Pin, X, Image, Table2, Search, ListTree, Check, CloudOff } from 'lucide-react';
import { documentMarkdown, EMPTY_DOCUMENT, FONTS, FONT_SIZES } from './documentModel';
import { DOCUMENT_SCHEMA, LINE_HEIGHTS } from './editorModel';
import { useDocumentContext, DocumentImage } from './DocumentContext';
import { mentionExtension } from './EditorMentions';

const Schema = Extension.create({ name: 'workspaceSchema', addGlobalAttributes() { return [
  { types: ['doc'], attributes: { schemaVersion: { default: DOCUMENT_SCHEMA } } },
  { types: ['paragraph','heading'], attributes: { lineHeight: { default: null, parseHTML: element => LINE_HEIGHTS.includes(element.style.lineHeight) ? element.style.lineHeight : null, renderHTML: attrs => LINE_HEIGHTS.includes(attrs.lineHeight) ? { style: `line-height: ${attrs.lineHeight}` } : {} } } }
]; } });
function ImageView({ node, updateAttributes, editor }) {
  return <NodeViewWrapper className="gw-opal-image-node" contentEditable={false}><DocumentImage assetId={node.attrs.assetId} caption={node.attrs.caption} credits={node.attrs.credits} />{editor.isEditable && <div className="gw-opal-image-fields"><input aria-label="Pie de imagen" placeholder="Pie de imagen" value={node.attrs.caption || ''} onChange={event => updateAttributes({caption:event.target.value})} /><input aria-label="Crédito de imagen" placeholder="Autoría o crédito" value={node.attrs.credits || ''} onChange={event => updateAttributes({credits:event.target.value})} /></div>}</NodeViewWrapper>;
}
const OriginalImage = Node.create({ name: 'originalImage', group: 'block', atom: true, draggable: true,
  addAttributes() { return {assetId:{default:null},caption:{default:''},credits:{default:''}}; },
  parseHTML() { return [{tag:'figure[data-original-id]',getAttrs:element=>({assetId:element.getAttribute('data-original-id'),caption:element.getAttribute('data-caption')||'',credits:element.getAttribute('data-credits')||''})}]; },
  renderHTML({ node, HTMLAttributes }) { return ['figure',mergeAttributes(HTMLAttributes,{'data-original-id':node.attrs.assetId,'data-caption':node.attrs.caption,'data-credits':node.attrs.credits}),['figcaption',node.attrs.caption || 'Imagen original privada']]; },
  addNodeView() { return ReactNodeViewRenderer(ImageView); }
});
function textMatches(editor, query) {
  if (!query) return [];
  const result = [], expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
  editor.state.doc.descendants((node,pos)=>{
    if (!node.isTextblock) return true;
    const text=node.textBetween(0,node.content.size,'\n','\ufffc');
    for (const match of text.matchAll(expression)) result.push({from:pos+1+match.index,to:pos+1+match.index+match[0].length});
    return false;
  }); return result;
}
export default function RichDocument({ initialDocument, initialMarkdown, onChange, disabled, scope = {}, palette = [], saveState, onSave, onSubmit, compact = false, ariaLabel, noteMode = false, placeholder }) {
  const context = useDocumentContext(), live = useRef({}); live.current = {...context,scope,onChange,onSave,onSubmit,pinned:false,pasteImage:live.current.pasteImage};
  const [pasteNotice,setPasteNotice] = useState(''),[panel,setPanel] = useState(''), [pinned,setPinned] = useState(false), [find,setFind] = useState(''), [replacement,setReplacement] = useState(''), [href,setHref] = useState(''), [error,setError] = useState(''), [uploading,setUploading] = useState(false);
  live.current.pinned = pinned;
  const selection = useRef(null), fileInput = useRef(null), hydrated = useRef(false);
  const mentionOpen = view => view.state.plugins.some(plugin => String(plugin.spec?.key?.key || '').startsWith('workspace-mentions') && plugin.getState(view.state)?.active);
  const extensions = useMemo(()=>[StarterKit.configure({link:{openOnClick:false},heading:{levels:[1,2,3]}}),TextStyleKit.configure({lineHeight:false}),Schema,Highlight.configure({multicolor:true}),TextAlign.configure({types:['heading','paragraph']}),TableKit.configure({table:{resizable:false}}),OriginalImage,mentionExtension(live)],[]);
  const editor = useEditor({ extensions, content:initialDocument || (initialMarkdown ? micromark(initialMarkdown) : EMPTY_DOCUMENT), shouldRerenderOnTransaction:false,
    editorProps:{attributes:{role:'textbox','aria-label':ariaLabel || (compact ? 'Texto con menciones' : 'Contenido del documento'),'aria-multiline':'true',spellcheck:'true'},handleKeyDown:(_view,event)=>{
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='s') { event.preventDefault(); live.current.onSave?.(); return true; }
      // Conversación: Enter envía; Mayús + Enter hace un salto de línea. Si la lista de menciones está abierta, Enter elige a la persona.
      if (live.current.onSubmit && event.key==='Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing && !mentionOpen(_view)) { event.preventDefault(); live.current.onSubmit(); return true; }
      if(!event.metaKey && !event.ctrlKey && (event.key.length===1 || ['Enter','Backspace','Delete'].includes(event.key))){selection.current=null;if(!live.current.pinned){setPanel('');}}
      return false;
    },
    // Capturas pegadas (sólo imagen, sin texto) en la conversación: se suben como imagen original del mensaje.
    // Word, Google Docs, Pages y la web: se conserva la estructura y el formato con significado; se quita lo demás.
    transformPastedHTML:html=>{const cleaned=cleanPastedHtml(html);setPasteNotice(cleaned.removedImages?`Se pegó el texto. ${cleaned.removedImages===1?'La imagen no se copia':`Las ${cleaned.removedImages} imágenes no se copian`} al pegar: añáde${cleaned.removedImages===1?'la':'las'} con el botón Imágenes.`:'');return cleaned.html;},
    handlePaste:(view,event)=>{
      const clipboard=event.clipboardData,plain=clipboard?.getData('text/plain')||'',html=clipboard?.getData('text/html')||'';
      // Markdown pegado (ChatGPT, notas, VS Code): se convierte en formato. Se respeta el HTML de procesadores de texto.
      if(plain&&looksLikeMarkdown(plain)&&(!html||/white-space:\s*pre|font-family:\s*(menlo|monaco|consolas|"?courier|"?sf mono|"?jetbrains|"?fira code)/i.test(html))){event.preventDefault();view.pasteHTML(markdownToHtml(plain));return true;}
      const items=[...(clipboard?.files||[])].filter(file=>file.type.startsWith('image/'));
      if(!items.length||!live.current.pasteImage||event.clipboardData.getData('text/html')||event.clipboardData.getData('text/plain'))return false;
      event.preventDefault();void live.current.pasteImage(items[0]);return true;
    }},
    onUpdate:({editor:instance})=>{const document=instance.getJSON();live.current.onChange({content_document:document,content_markdown:documentMarkdown(document)});}
  });
  const state=useEditorState({editor,selector:({editor:e})=>e && !e.isDestroyed && e.schema ? {bold:e.isActive('bold'),italic:e.isActive('italic'),underline:e.isActive('underline'),strike:e.isActive('strike'),list:e.isActive('bulletList'),ordered:e.isActive('orderedList'),highlight:e.isActive('highlight'),table:e.isActive('table'),font:e.getAttributes('textStyle').fontFamily||Object.keys(FONTS)[0],size:e.getAttributes('textStyle').fontSize||'16px',color:e.getAttributes('textStyle').color||'#303039',heading:e.isActive('blockquote')?'quote':e.isActive('heading')?`h${e.getAttributes('heading').level}`:'paragraph',align:e.getAttributes(e.isActive('heading')?'heading':'paragraph').textAlign||'left',height:e.getAttributes(e.isActive('heading')?'heading':'paragraph').lineHeight||'1.8',undo:e.can().undo(),redo:e.can().redo(),empty:e.getText().trim()==='',text:e.getText(),from:e.state.selection.from,to:e.state.selection.to,headings:(()=>{const list=[];e.state.doc.descendants((node,pos)=>{if(node.type.name==='heading')list.push({text:node.textContent,level:node.attrs.level,pos});});return list;})()} : null});
  useEffect(()=>{if(editor && !editor.isDestroyed && editor.schema && state && !hydrated.current){hydrated.current=true;const document=editor.getJSON();live.current.onChange({content_document:document,content_markdown:documentMarkdown(document)},true);}},[editor,Boolean(state)]);
  useEffect(()=>{editor?.setEditable(!disabled);},[editor,disabled]);
  useEffect(()=>{if(!editor)return;const escape=event=>{if(event.key==='Escape'){setPanel('');setPinned(false);}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[editor]);
  if(!editor || !state)return <p role="status">Abriendo documento…</p>;
  const remember=()=>{selection.current={from:editor.state.selection.from,to:editor.state.selection.to};};
  const chain=()=>{const c=editor.chain().focus();return selection.current ? c.setTextSelection(selection.current) : c;};
  const open=id=>{remember();setError('');setPanel(current=>current===id?'':id);if(id==='link')setHref(editor.getAttributes('link').href||'');};
  const apply=action=>{if(disabled)return;action(chain()).run();selection.current=null;};
  const chooseStyle=value=>{apply(c=>value==='quote'?c.toggleBlockquote():value[0]==='h'?c.setHeading({level:Number(value[1])}):c.setParagraph());};
  const count=state.text.trim().split(/\s+/).filter(Boolean).length;
  const matches=textMatches(editor,find);
  const findNext=()=>{const match=matches.find(item=>item.from>editor.state.selection.from)||matches[0];if(match){editor.chain().focus().setTextSelection(match).scrollIntoView().run();selection.current=match;}};
  const replace=all=>{const selected=matches.find(item=>item.from===editor.state.selection.from&&item.to===editor.state.selection.to);const targets=all?matches:selected?[selected]:[];if(!targets.length){findNext();return;}const tr=editor.state.tr;for(const item of [...targets].reverse())tr.insertText(replacement,item.from,item.to);editor.view.dispatch(tr);};
  const button=(label,Icon,action,pressed,locked=false)=><button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled||locked} onMouseDown={event=>event.preventDefault()} onClick={action}><Icon size={16} aria-hidden="true" /></button>;
  const basic=<>{button('Negrita',Bold,()=>apply(c=>c.toggleBold()),state.bold)}{button('Cursiva',Italic,()=>apply(c=>c.toggleItalic()),state.italic)}{button('Subrayado',Underline,()=>apply(c=>c.toggleUnderline()),state.underline)}{button('Resaltar',Highlighter,()=>apply(c=>c.toggleHighlight({color:'#FFF0A8'})),state.highlight)}{button('Añadir o editar enlace',Link2,event=>open('link',event.currentTarget))}{button('Más formato',MoreHorizontal,event=>open('format',event.currentTarget))}</>;
  const insertImage=asset=>{apply(c=>c.insertContent({type:'originalImage',attrs:{assetId:asset.id,caption:'',credits:''}}));setPanel('');};
  async function uploadFile(file){remember();setUploading(true);setError('');try{const asset=await live.current.uploadImage?.(scope,file);if(!asset)throw Error('Guarda la referencia antes de añadir imágenes al texto.');insertImage(asset);}catch(failure){setError(failure.message);}finally{setUploading(false);}}
  live.current.pasteImage=scope.attachments&&context.uploadImage&&!disabled?uploadFile:null;
  async function upload(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;remember();setUploading(true);setError('');try{const asset=await live.current.uploadImage?.(scope,file);if(!asset)throw Error('Guarda la referencia antes de añadir imágenes al texto.');insertImage(asset);}catch(failure){setError(failure.message);}finally{setUploading(false);}}
  return <div className={`gw-writing-editor gw-opal-editor${compact?' gw-opal-compact':''}${noteMode?' gw-opal-note':''}`}>
    <div className="gw-format-toolbar gw-opal-toolbar" aria-label="Formato del documento">
      <label><span className="gw-sr-only">Estilo de párrafo</span><select value={state.heading} disabled={disabled} onChange={event=>chooseStyle(event.target.value)}><option value="paragraph">Texto</option><option value="h1">Título</option><option value="h2">Subtítulo</option><option value="h3">Sección</option><option value="quote">Cita</option></select></label>
      {basic}{!noteMode&&button('Imágenes',Image,()=>open('images'))}{!noteMode&&button('Tabla',Table2,()=>open('table'))}{!noteMode&&button('Buscar y reemplazar',Search,event=>open('find',event.currentTarget))}{!compact&&button('Índice del documento',ListTree,event=>open('outline',event.currentTarget))}{button('Deshacer',Undo2,()=>apply(c=>c.undo()),undefined,!state.undo)}{button('Rehacer',Redo2,()=>apply(c=>c.redo()),undefined,!state.redo)}
    </div>
    <BubbleMenu editor={editor} className="gw-opal-floating" options={{strategy:'fixed',placement:'top',offset:10,flip:true,shift:{padding:12}}} shouldShow={({state:s})=>!disabled&&!s.selection.empty&&!panel&&editor.isFocused}>{basic}</BubbleMenu>
    {panel && panel!=='save'&&createPortal(<section className={`gw-opal-tools${pinned?' gw-opal-tools-pinned':''}`} aria-label="Herramientas de escritura"><header><strong>{{format:'Formato',images:'Imágenes',table:'Tabla',link:'Enlace',find:'Buscar y reemplazar',outline:'Índice'}[panel]}</strong><span><button type="button" aria-label={pinned?'Desfijar herramientas':'Fijar herramientas al lado'} aria-pressed={pinned} onClick={()=>setPinned(!pinned)}><Pin size={15}/></button><button type="button" aria-label="Cerrar herramientas" onClick={()=>{setPanel('');setPinned(false);}}><X size={15}/></button></span></header>
      {panel==='format'&&<><div className="gw-opal-tool-row">{button('Tachado',Strikethrough,()=>apply(c=>c.toggleStrike()),state.strike)}{button('Lista',List,()=>apply(c=>c.toggleBulletList()),state.list)}{button('Lista numerada',ListOrdered,()=>apply(c=>c.toggleOrderedList()),state.ordered)}</div><label>Tipografía<select aria-label="Tipografía" value={state.font} disabled={disabled} onChange={event=>apply(c=>c.setFontFamily(event.target.value))}>{Object.entries(FONTS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="gw-opal-tool-row"><label>Tamaño<select aria-label="Tamaño del texto" value={state.size} disabled={disabled} onChange={event=>apply(c=>c.setFontSize(event.target.value))}>{FONT_SIZES.map(size=><option value={size} key={size}>{size.replace('px','')}</option>)}</select></label><label>Interlineado<select aria-label="Interlineado" value={state.height} disabled={disabled} onChange={event=>apply(c=>c.updateAttributes(state.heading[0]==='h'?'heading':'paragraph',{lineHeight:event.target.value}))}>{LINE_HEIGHTS.map(value=><option key={value}>{value}</option>)}</select></label></div><label>Alineación<select aria-label="Alineación" value={state.align} disabled={disabled} onChange={event=>apply(c=>c.setTextAlign(event.target.value))}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option><option value="justify">Justificada</option></select></label><div className="gw-opal-tool-row"><label>Color<input type="color" aria-label="Color del texto" value={/^#[\da-f]{6}$/i.test(state.color)?state.color:'#303039'} disabled={disabled} onChange={event=>apply(c=>c.setColor(event.target.value))}/></label><label>Código HEX<input aria-label="Código de color del texto" defaultValue={state.color} key={state.color} placeholder="#303039" disabled={disabled} onBlur={event=>{if(/^#[\da-f]{6}$/i.test(event.target.value))apply(c=>c.setColor(event.target.value));}}/></label></div>{palette.length>0&&<div className="gw-opal-swatches" aria-label="Colores del documento">{palette.map(color=><button type="button" key={color} aria-label={`Aplicar ${color}`} title={color} style={{backgroundColor:color}} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>apply(c=>c.setColor(color))}/>)}</div>}<button type="button" disabled={disabled} onClick={()=>apply(c=>c.unsetAllMarks().clearNodes())}>Quitar formato</button></>}
      {panel==='table'&&<><button type="button" disabled={disabled} onClick={()=>apply(c=>c.insertTable({rows:3,cols:2,withHeaderRow:true}))}><Table2 size={16}/>Insertar tabla</button>{state.table&&<div className="gw-opal-table-actions"><button type="button" onClick={()=>apply(c=>c.addRowAfter())} disabled={disabled}>Añadir fila</button><button type="button" onClick={()=>apply(c=>c.addColumnAfter())} disabled={disabled}>Añadir columna</button><button type="button" onClick={()=>apply(c=>c.deleteRow())} disabled={disabled}>Quitar fila</button><button type="button" onClick={()=>apply(c=>c.deleteColumn())} disabled={disabled}>Quitar columna</button><button type="button" onClick={()=>apply(c=>c.deleteTable())} disabled={disabled}>Quitar tabla</button></div>}</>}
      {panel==='images'&&<><button type="button" disabled={disabled||uploading||!context.uploadImage||(scope.kind==='comment'&&!scope.attachments)} onClick={()=>fileInput.current?.click()}><Image size={16}/>{uploading?'Subiendo original…':'Subir imagen original'}</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/tiff,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,.avif,.heic,.heif" aria-label="Imagen original para el documento" hidden onChange={upload}/>{Object.values(context.originals||{}).filter(asset=>asset.mime_type?.startsWith('image/')).map(asset=><button key={asset.id} type="button" disabled={disabled} onClick={()=>insertImage(asset)}><Image size={14}/>{asset.file_name}</button>)}</>}
      {panel==='link'&&<><label>Dirección del enlace<input type="url" aria-label="Dirección del enlace" placeholder="https://…" value={href} onChange={event=>setHref(event.target.value)}/></label><button type="button" disabled={disabled} onClick={()=>{if(!/^https?:\/\/[^\s<>]+$/i.test(href)){setError('Usa un enlace HTTP o HTTPS completo.');return;}apply(c=>c.extendMarkRange('link').setLink({href}));setPanel('');}}>Aplicar enlace</button><button type="button" disabled={disabled} onClick={()=>{apply(c=>c.extendMarkRange('link').unsetLink());setPanel('');}}>Quitar enlace</button></>}
      {panel==='find'&&<><label>Buscar<input aria-label="Buscar en el documento" value={find} onChange={event=>setFind(event.target.value)}/></label><p>{matches.length} coincidencias</p><button type="button" disabled={!matches.length} onClick={findNext}>Siguiente coincidencia</button><label>Reemplazar por<input aria-label="Reemplazar por" value={replacement} onChange={event=>setReplacement(event.target.value)} disabled={disabled}/></label><div className="gw-opal-tool-row"><button type="button" disabled={disabled||!matches.length} onClick={()=>replace(false)}>Reemplazar</button><button type="button" disabled={disabled||!matches.length} onClick={()=>replace(true)}>Reemplazar todo</button></div></>}
      {panel==='outline'&&<nav aria-label="Índice del documento">{state.headings.length?state.headings.map(heading=><button type="button" key={heading.pos} style={{paddingLeft:`${(heading.level-1)*12+8}px`}} onClick={()=>editor.chain().focus().setTextSelection(heading.pos+1).scrollIntoView().run()}>{heading.text||'Título sin texto'}</button>):<p>Añade títulos y subtítulos para recorrer el documento.</p>}</nav>}{error&&<p role="alert" className="gw-error">{error}</p>}
    </section>,document.body)}
    <EditorContent editor={editor} className="gw-writing-paper" data-empty={state.empty||undefined} data-placeholder={placeholder||undefined}/>
    {pasteNotice&&<p role="status" className="gw-opal-paste-notice">{pasteNotice}<button type="button" aria-label="Cerrar aviso" onClick={()=>setPasteNotice('')}>×</button></p>}
    {!compact&&<footer className="gw-opal-editor-foot"><span>{count} {count===1?'palabra':'palabras'}</span><small>Escribe @ para mencionar · Markdown: **negrita**, *cursiva*, ## título, - lista</small></footer>}
    {saveState&&<button type="button" className="gw-opal-save-orb" data-state={saveState.state} aria-label={saveState.text} title={saveState.text} onClick={()=>setPanel(panel==='save'?'':'save')}><span>{saveState.state==='saved'?<Check size={18}/>:saveState.state==='error'?<CloudOff size={18}/>:<span className="gw-opal-orb-dot"/>}</span><small>{saveState.state==='saved'?'Guardado':saveState.state==='saving'?'Guardando':saveState.state==='error'?'Sin guardar':'Pendiente'}</small></button>}
    {panel==='save'&&<aside className="gw-opal-save-details" role="status"><strong>{saveState?.text}</strong><p>Guardar conserva tu borrador privado. Enviar a revisión comparte una versión con las personas autorizadas.</p></aside>}
  </div>;
}
