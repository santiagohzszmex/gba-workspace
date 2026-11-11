import React, { useEffect, useState } from 'react';
import { Send, Search, X } from 'lucide-react';

export default function SendDocument({ document, inboxApi, onClose, onSent }) {
  const [people,setPeople]=useState(null),[query,setQuery]=useState(''),[selected,setSelected]=useState([]);
  const [error,setError]=useState(''),[sending,setSending]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{let live=true;setPeople(null);setError('');
    inboxApi('recipients',{id:document.id}).then(rows=>{if(live)setPeople(rows);}).catch(failure=>{if(live)setError(failure.message);});
    return()=>{live=false;};},[document.id,inboxApi,retry]);
  const matches=people?.filter(person=>`${person.display_name} ${person.handle}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function send(event){event.preventDefault();if(sending||!selected.length)return;setSending(true);setError('');
    try{const result=await inboxApi('send',{id:document.id,recipients:selected,revision:document.revision});onSent(result.sent?`Documento enviado a ${result.sent} ${result.sent===1?'persona':'personas'}.`:'Esta revisión ya estaba enviada a esas personas.');}
    catch(failure){setError(failure.message);setSending(false);}}
  return <section className="gw-document-send" aria-label="Enviar documento">
    <header><div><h4>Enviar documento</h4><p>Comparte esta revisión de «{document.title}». No se convierte en una entrega ni se envía a revisión.</p></div><button type="button" className="gw-wk-btn" disabled={sending} aria-label="Cerrar envío" onClick={onClose}><X size={16}/></button></header>
    <form onSubmit={send}><label className="gw-document-recipient-search"><Search size={16}/><span className="gw-sr-only">Buscar destinatario</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar integrante de GIMG"/></label>
      <p>Integrantes de todas las producciones con acceso vigente a GIMG. Sólo podrán leer esta copia y sus archivos.</p>
      {error&&<p role="alert">{error}{people===null&&<button type="button" onClick={()=>setRetry(n=>n+1)}>Reintentar</button>}</p>}
      {people===null&&!error?<p role="status">Buscando integrantes…</p>:<div className="gw-document-recipients" role="group" aria-label="Destinatarios">{matches?.map(person=><label key={person.user_id}><input type="checkbox" checked={selected.includes(person.user_id)} disabled={sending} onChange={e=>setSelected(current=>e.target.checked?[...current,person.user_id]:current.filter(id=>id!==person.user_id))}/><span><strong>{person.display_name}</strong><small>@{person.handle}</small></span></label>)}{!matches?.length&&people!==null&&<p>{people.length?'No hay coincidencias con esa búsqueda.':'No hay otros integrantes con acceso vigente a GIMG.'}</p>}</div>}
      <footer><span>{selected.length} destinatarios</span><button type="submit" className="gw-wk-btn gw-wk-btn-primary" disabled={sending||!selected.length||selected.length>50}><Send size={15}/>{sending?'Enviando…':'Enviar documento'}</button></footer>
    </form>
  </section>;
}
