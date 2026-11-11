import React, { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { documentText } from './documentModel';
const RichDocument = React.lazy(() => import('./RichDocument'));
import {DeadlineField} from './DeadlineViews';
import { STATES, dateLabel, inputDate, isoDate } from './gimgModel';
export const choices=(items,label='title')=>Object.fromEntries(items.map(x=>[x.id||x.user_id,x[label]||x.display_name]));
export async function rpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}
export function CommandForm({fields,onSave,initial={},button='Guardar',busy=false,resetOnSuccess=Object.keys(initial).length === 0}){
 const submitting = useRef(false), rich = useRef({});
 const [areaId,setAreaId] = useState(initial.area_id || '');
 const [formKey,setFormKey] = useState(0);
 async function submit(event) {
  event.preventDefault();
  if (busy || submitting.current) return;
  submitting.current = true;
  const form = event.currentTarget;
  const values = new FormData(form);
  const out = {};
  for (const [key, field] of Object.entries(fields)) {
   const value = values.get(key);
   if (field.type === 'richtext') { const document = rich.current[key] || initial[`${key}_document`]; out[key] = documentText(document); out[`${key}_document`] = document; out.editor_version = 2; } else {out[key] = field.type === 'datetime-local' ? isoDate(value) : value || null;if(field.type==='deadline')out.due_has_time=values.get(`${key}_has_time`)==='true';}
  }
  try {
   const result = await onSave(out);
   if (resetOnSuccess && result) { form.reset(); rich.current = {}; setFormKey(value=>value+1); }
  } finally { submitting.current = false; }
 }
 return <form className="gw-form" onSubmit={submit} onChange={event=>{if(event.target.name==='area_id')setAreaId(event.target.value);}}>{Object.entries(fields).map(([key,value])=>{
  const f=typeof value==='string'?{label:value}:value;
  const initialValue=f.type==='datetime-local'?inputDate(initial[key]):initial[key]??'';
  const inputProps={name:key,disabled:busy,required:!f.optional,defaultValue:initialValue};
  const Field = ['richtext','deadline'].includes(f.type) ? 'div' : 'label';
  return <Field key={key} className={['textarea','richtext','deadline'].includes(f.type)?'gw-field-wide':undefined}>{f.label}{f.type==='deadline'?<DeadlineField key={formKey} name={key} initialValue={initial[key]} hasTime={initial.due_has_time!==false} disabled={busy}/>:f.type==='richtext'?<React.Suspense fallback={<p role="status">Abriendo texto…</p>}><RichDocument key={formKey} compact ariaLabel={f.label} scope={{...f.scope,areaId:areaId || f.scope?.areaId}} disabled={busy} initialDocument={initial[`${key}_document`]} initialMarkdown={initialValue} onChange={value=>{rich.current[key]=value.content_document;}}/></React.Suspense>:f.options?<select {...inputProps}><option value="">Seleccionar</option>{Object.entries(f.options).map(([id,name])=><option value={id} key={id}>{name}</option>)}</select>:f.type==='textarea'?<textarea {...inputProps} minLength={f.minLength}/>:<input {...inputProps} minLength={f.minLength} type={f.type||'text'}/>}</Field>;
 })}<button className="gw-primary" disabled={busy}>{button}</button></form>;
}

export function TaskList({tasks,onPick,selectedId}){return <div className="gw-list">{tasks.map(t=><button key={t.id} className={selectedId===t.id?'gw-selected':''} onClick={()=>onPick(t)}><div className="gw-row"><strong>{t.title}</strong><span className="gw-badge">{['image','video'].includes(t.kind)&&t.state==='area_approved'?(t.kind==='video'?'Aprobado por el área':'Aprobada por el área'):STATES[t.state]}</span></div><p>{dateLabel(t.due_at)}{['image','video'].includes(t.kind)&&` · ${t.kind==='video'?'Video':'Imagen'} · ${t.current_version?`v${t.current_version}`:'Sin entregar'}`}</p>{t.block_reason&&<p className="gw-error">{t.block_reason}</p>}</button>)}{!tasks.length&&<p className="gw-empty">No hay trabajos en esta lista.</p>}</div>;}
export function Activity({rows}){return <div className="gw-list">{rows.map(r=><article key={r.id}><strong>{r.action}</strong><p>{dateLabel(r.created_at)}</p><small>Actor: {r.actor_id} · Objeto: {r.entity_id||'Unidad'}</small>{r.context?.reason&&<p>{r.context.reason}</p>}</article>)}{!rows.length&&<p className="gw-empty">Sin actividad nueva en tu alcance.</p>}</div>;}
