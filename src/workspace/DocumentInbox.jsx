import React, { useEffect, useRef, useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';
import { DocumentContext, useDocumentContext } from './DocumentContext';
import StructuredDocument from './StructuredDocument';
import ReferenceOriginal from './ReferenceOriginal';
import { dateLabel } from './gimgModel';
import './supportDocuments.css';

export default function DocumentInbox({ unitId, inboxApi, initialDeliveryId, anchorId }) {
  const context=useDocumentContext(),root=useRef(null);
  const [sent,setSent]=useState(false),[rows,setRows]=useState([]),[selectedId,setSelectedId]=useState(initialDeliveryId||'');
  const [document,setDocument]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[epoch,setEpoch]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  useEffect(()=>{if(initialDeliveryId){setSent(false);setSelectedId(initialDeliveryId);}},[initialDeliveryId]);
  useEffect(()=>{if(!inboxApi)return;let live=true;setLoading(true);setError('');setRows([]);setHasMore(false);
    inboxApi('list',{unitId,sent}).then(value=>{if(live){setRows(value);setHasMore(value.length===200);}}).catch(failure=>{if(live)setError(failure.message);}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};},[unitId,sent,epoch,inboxApi]);
  useEffect(()=>{let live=true;setDocument(null);if(!selectedId||!inboxApi)return;
    inboxApi('read',{id:selectedId}).then(value=>{if(live){setDocument(value);setRows(current=>current.map(row=>row.id===value.id?{...row,read_at:value.read_at}:row));}}).catch(failure=>{if(live)setError(failure.message);});
    return()=>{live=false;};},[selectedId,inboxApi]);
  useEffect(()=>{if(!document||!anchorId)return;const node=root.current?.querySelector(`[data-mention-id="${CSS.escape(anchorId)}"]`);node?.classList.add('gw-opal-mention-target');node?.scrollIntoView({block:'center'});},[document,anchorId]);
  const originals={...context.originals,...Object.fromEntries((document?.originals||[]).map(asset=>[asset.id,asset]))};
  async function more(){const last=rows[rows.length-1];if(!last||loading)return;setLoading(true);setError('');try{
    const value=await inboxApi('list',{unitId,sent,before:last.created_at,beforeId:last.id});setRows(current=>[...current,...value]);setHasMore(value.length===200);
  }catch(failure){setError(failure.message);}finally{setLoading(false);}}
  return <section className="gw-support gw-document-inbox" aria-label="Bandeja de entrada">
    <div className="gw-support-heading"><div><h2>Bandeja de entrada</h2><p>Documentos que compartes con personas de GIMG, incluso de otras producciones. No son entregas ni conversaciones.</p></div><button type="button" className="gw-wk-btn" aria-label="Actualizar bandeja" disabled={loading||!inboxApi} onClick={()=>setEpoch(n=>n+1)}><RefreshCw size={16}/></button></div>
    <div className="gw-opal-inbox-tabs" role="group" aria-label="Tipo de envío"><button type="button" disabled={loading} aria-pressed={!sent} onClick={()=>{setSent(false);setSelectedId('');}}>Recibidos</button><button type="button" disabled={loading} aria-pressed={sent} onClick={()=>{setSent(true);setSelectedId('');}}>Enviados</button></div>
    {!inboxApi&&<p>La bandeja requiere una sesión real de GBA ID.</p>}{error&&<p className="gw-support-alert" role="alert">{error}</p>}{loading&&<p role="status">Abriendo bandeja…</p>}
    <div className="gw-support-layout"><aside className="gw-support-list" aria-label={sent?'Documentos enviados':'Documentos recibidos'}>{rows.map(row=><button key={row.id} type="button" aria-current={selectedId===row.id||undefined} onClick={()=>{setError('');setSelectedId(row.id);}}><Inbox size={16}/><span><strong>{row.title}</strong><small>{sent?`Para ${row.recipient_name}`:`De ${row.sender_name}`} · {row.edition_title}</small><small>{dateLabel(row.created_at)}{!sent&&!row.read_at?' · Sin leer':''}</small></span></button>)}{!loading&&!rows.length&&<p>{sent?'Todavía no has enviado documentos.':'Cuando alguien te envíe un documento, aparecerá aquí.'}</p>}{hasMore&&<button type="button" disabled={loading} onClick={()=>void more()}>Ver documentos anteriores</button>}</aside>
      {document?<DocumentContext.Provider value={{...context,originals}}><article className="gw-support-document" ref={root}><header><div><span className="gw-wk-eyebrow">{document.edition_title} · Revisión {document.revision}</span><h3>{document.title}</h3><p>Copia enviada · {dateLabel(document.created_at)}. El autor conserva su documento.</p></div></header><StructuredDocument document={document.content_document}/>{document.credits&&<p>Créditos: {document.credits}</p>}{document.originals?.map(asset=><ReferenceOriginal key={asset.id} asset={asset} gateway={context.gateway}/>)}</article></DocumentContext.Provider>:<div className="gw-wk-empty"><Inbox size={30}/><h3>{selectedId?'Abriendo documento…':'Selecciona un documento'}</h3><p>Puedes leerlo aquí, sin descargarlo ni enviarlo a otra aplicación.</p></div>}
    </div>
  </section>;
}
