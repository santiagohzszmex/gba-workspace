import React, { useEffect, useRef, useState } from 'react';
import { Bell, X, CheckCheck } from 'lucide-react';
import { rpc } from './ui';
import {createNotificationInbox} from './notificationInbox.mjs';
import {closeReadDeviceNotices,nativeWorkspace} from './devicePush.mjs';
import DeviceNotifications from './DeviceNotifications';
import { dateLabel } from './gimgModel';
const isMention = item => ['mention','support.mention'].includes(item.event_type) || item.event_type==='document.received' && Boolean(item.anchor_id);

export default function Notifications({ actorId, previewMode, previewItems = [], onOpen, blocked }) {
  const [open,setOpen]=useState(()=>!previewMode&&new URLSearchParams(location.search).has('device-notifications')), [unreadOnly,setUnreadOnly]=useState(false),[mentionsOnly,setMentionsOnly]=useState(false);
  const [inbox,setInbox]=useState({items:[],unread_count:0,error:'',reading:false}), [previewRead,setPreviewRead]=useState([]);
  const controller=useRef(null), trigger=useRef(null), panel=useRef(null),deepLink=useRef(false);
  useEffect(()=>{
    if(previewMode){setPreviewRead([]);return;}
    const box=createNotificationInbox(rpc,state=>{setInbox(state);void closeReadDeviceNotices(actorId,state).catch(()=>{});});controller.current=box;
    setInbox(box.snapshot);
    const refresh=()=>{if(!document.hidden||nativeWorkspace())void box.refresh();};
    refresh();const timer=setInterval(refresh,45000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return ()=>{box.dispose();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);controller.current=null;};
  },[actorId,previewMode]);
  useEffect(()=>{if(open)panel.current?.focus();},[open]);
  useEffect(()=>{
    if(previewMode||blocked||deepLink.current)return;
    const id=new URLSearchParams(location.search).get('notification');
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||''))return;
    deepLink.current=true;visit({id});
  },[blocked,previewMode]);
  const {error,reading,message}=inbox;
  const items=previewMode ? previewItems.map(item=>({...item,read_at:previewRead.includes(item.id) ? 'read' : null})) : inbox.items;
  const unread=previewMode ? items.filter(item=>!item.read_at).length : inbox.unread_count;
  const close=()=>{setOpen(false);trigger.current?.focus();};
  async function mark(item){
    if(previewMode){setPreviewRead(rows=>[...rows,item.id]);return item;}
    return controller.current?.read(item.id);
  }
  async function readAll(){
    if(previewMode)setPreviewRead(items.map(item=>item.id));else await controller.current?.read();
  }
  function visit(item){onOpen(async()=>{
    const target=await mark(item);
    if(target){close();const url=new URL(location.href);url.searchParams.delete('notification');history.replaceState(history.state,'',url);return target;}
    setOpen(true);return null;
  },item);}
  return <div className="gw-notifications">
    <button ref={trigger} type="button" aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`} aria-expanded={open} aria-controls="workspace-notifications" disabled={blocked} onClick={()=>{setOpen(value=>!value);void controller.current?.refresh();}}><Bell size={17} aria-hidden="true"/>{unread>0 && <span className="gw-notification-badge">{unread>99 ? '99+' : unread}</span>}</button>
    {open && <aside ref={panel} tabIndex={-1} id="workspace-notifications" className="gw-notification-panel" aria-label="Tus notificaciones" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
      <header><div><h2>Notificaciones</h2><p>{unread ? `${unread} sin leer` : 'Estás al día'}</p></div><button type="button" aria-label="Cerrar notificaciones" onClick={close}><X size={18}/></button></header>
      <div className="gw-opal-inbox-tabs" role="group" aria-label="Tipo de notificación"><button type="button" aria-pressed={!mentionsOnly} onClick={()=>setMentionsOnly(false)}>Todo</button><button type="button" aria-pressed={mentionsOnly} onClick={()=>setMentionsOnly(true)}>Menciones</button></div><div className="gw-notification-tools"><label><input type="checkbox" checked={unreadOnly} onChange={event=>setUnreadOnly(event.target.checked)}/>Sólo sin leer</label><button type="button" disabled={reading || !unread || (!previewMode && !inbox.fetched_at)} onClick={()=>void readAll()}><CheckCheck size={15}/>Marcar todas como leídas</button></div>
      {error && <div className="gw-notification-error"><p role="alert">{error}</p><button type="button" onClick={()=>void controller.current?.refresh()}>Reintentar</button></div>}
      {message&&<p className="gw-notification-status" role="status">{message}</p>}
      <DeviceNotifications key={actorId} actorId={actorId} previewMode={previewMode}/>
      <div className="gw-notification-list">{items.filter(item=>(!unreadOnly || !item.read_at) && (!mentionsOnly || isMention(item))).map(item=><article key={item.id} className={!item.read_at ? 'gw-notification-unread' : ''}><button type="button" disabled={reading} onClick={()=>visit(item)}><strong>{item.title}</strong><span>{item.body}</span><small>{(item.project_title || item.edition_title) ? `${item.project_title || item.edition_title} · ` : ''}{dateLabel(item.created_at)}</small>{!item.read_at && <span className="gw-sr-only">Sin leer</span>}</button>{!item.read_at&&<button className="gw-notification-mark" type="button" disabled={reading} aria-label={`Marcar como leída: ${item.title}`} onClick={()=>void mark(item)}><CheckCheck size={15}/>Marcar como leída</button>}</article>)}{!items.some(item=>(!unreadOnly || !item.read_at) && (!mentionsOnly || isMention(item))) && <p className="gw-notification-empty">{mentionsOnly ? 'Todavía no tienes menciones en este alcance.' : unreadOnly ? 'No tienes notificaciones pendientes.' : 'Aquí aparecerán tus asignaciones, revisiones y avisos de tus producciones.'}</p>}</div>
      <footer>Los avisos corresponden a tus funciones y accesos vigentes en GIMG.</footer>
    </aside>}
  </div>;
}
