import SaveNotice from './SaveNotice';
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { dateLabel } from './gimgModel';
import { scheduleLicenseExpiry } from './licenseClock';

export function LicenseGate({ children }) {
  const [license,setLicense]=useState(null),[error,setError]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    const check=async()=>{try {const {data,error:e}=await supabase.rpc('workspace_license_status');if(active){setLicense(e?{active:false}:data);setError(e?'No pudimos verificar tu licencia. Revisa la conexión.':'');}}catch{if(active){setLicense({active:false});setError('Conéctate para verificar tu licencia.');}}};
    void check();const timer=setInterval(check,30000);const visible=()=>{if(document.visibilityState==='visible')void check();};document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[]);
  useEffect(()=>{if(!license?.expires_at)return;return scheduleLicenseExpiry(license.expires_at,()=>setLicense(current=>({...current,active:false})));},[license?.expires_at]);
  async function activate(e){e.preventDefault();setBusy(true);setError('');try{const {data,error:e}=await supabase.rpc('workspace_activate_license',{p_code:code});if(e||data?.error)throw Error(data?.error||'No pudimos activar el código');setCode('');const status=await supabase.rpc('workspace_license_status');if(status.error)throw Error('No pudimos verificar la activación');setLicense(status.data);}catch(e){setError(e.message);}finally{setBusy(false);}}
  if(license===null)return <main className="gw-license"><p role="status">Verificando licencia…</p></main>;
  if(license.active && new Date(license.expires_at)>new Date())return children;
  return <main className="gw-license"><form onSubmit={activate}><p className="gw-eyebrow">WORKSPACE · ESCRITORIO</p><h1>Activa tu espacio de trabajo.</h1><p>Introduce el código que recibiste de GBA: de Workspace o de Sepia (el mismo de Ultramar). Su duración comienza al activarlo y queda vinculada a tu GBA ID.</p><label>Código de licencia<input autoComplete="off" required value={code} onChange={e=>setCode(e.target.value)} maxLength={70}/></label>{error&&<p role="alert">{error}</p>}<button disabled={busy}>{busy?'Activando…':'Activar licencia'}</button><p>La versión web continúa disponible según tu membresía y permisos.</p></form></main>;
}
export default function LicensePanel({ previewMode=false }) {
  const [codes,setCodes]=useState([]),[days,setDays]=useState(30),[label,setLabel]=useState(''),[recipient,setRecipient]=useState(''),[issued,setIssued]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  async function load(){if(previewMode)return;const {data,error}=await supabase.rpc('workspace_license_codes');if(error)setNotice(error.message);else setCodes(data||[]);}
  useEffect(()=>{void load();},[previewMode]);
  async function issue(e){e.preventDefault();setBusy(true);setIssued(null);setNotice('');try{let userId=null;if(recipient.trim()){const resolved=await supabase.rpc('workspace_license_recipient',{p_handle:recipient.trim()});if(resolved.error)throw resolved.error;userId=resolved.data;}const {data,error}=await supabase.rpc('workspace_issue_license',{p_duration_seconds:Number(days)*86400,p_label:label,p_user_id:userId||null,p_redeem_before:null});if(error)throw error;setIssued(data);setLabel('');setRecipient('');setDays(30);setNotice('Licencia creada. Guarda el código que se muestra.');await load();}catch(e){setNotice(e.message);}finally{setBusy(false);}}
  async function revoke(id){const reason=window.prompt('Motivo de revocación (mínimo 10 caracteres)');if(!reason)return;const {error}=await supabase.rpc('workspace_revoke_license',{p_code_id:id,p_reason:reason});if(error)setNotice(error.message);else {await load();setNotice('Licencia revocada.');}}
  return <section><p className="gw-eyebrow">ADMINISTRACIÓN TÉCNICA</p><h2>Licencias de escritorio</h2><p>Un código se activa una vez y queda vinculado a una cuenta. La licencia permite usar la app; los proyectos requieren membresía y permisos.</p><form className="gw-form" onSubmit={issue}><label>Etiqueta<input required maxLength={120} value={label} onChange={e=>setLabel(e.target.value)}/></label><label>Duración en días<input required min={1} max={3650} type="number" value={days} onChange={e=>setDays(e.target.value)}/></label><label>GBA ID de destino (opcional)<input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Ej. @Santiago"/></label><button disabled={busy||previewMode}>{busy?'Emitiendo…':'Crear código'}</button></form>{issued&&<div className="gw-code"><strong>Guarda y entrega este código. Se muestra una sola vez.</strong><code>{issued.code.match(/.{1,6}/g).join('-')}</code><button onClick={()=>setIssued(null)}>Ya lo guardé</button></div>}<SaveNotice message={notice} onDismiss={()=>setNotice('')}/><div className="gw-list">{codes.map(c=><article key={c.id}><h3>{c.label}</h3><p>{c.duration_seconds/86400} días · {c.revoked_at?'Revocado':c.redeemed_at?'Activado':'Sin activar'}</p><p>Emitido: {dateLabel(c.issued_at)}</p>{!c.revoked_at&&<button onClick={()=>void revoke(c.id)}>Revocar</button>}</article>)}</div></section>;
}
