import React, { useState } from 'react';
import { AlertTriangle, Trash2, RotateCcw } from 'lucide-react';
import { dateLabel } from './gimgModel';

// Retirar una producción del espacio activo, con confirmación por nombre y motivo.
export function RemoveProduction({ project, onRemove, busy }) {
  const [confirming,setConfirming]=useState(false),[confirmation,setConfirmation]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState('');
  async function remove(event){event.preventDefault();setError('');try{await onRemove(project,confirmation,reason);setConfirming(false);setConfirmation('');setReason('');}catch(failure){setError(failure.message);}}
  return <div className="gw-production-remove">
    {!confirming ? <button type="button" className="gw-production-remove-start" disabled={busy} onClick={()=>setConfirming(true)}><Trash2 size={15} aria-hidden="true"/>Eliminar producción</button>
    : <form onSubmit={remove} className="gw-removal-confirmation"><div className="gw-removal-warning"><AlertTriangle size={21} aria-hidden="true"/><div><strong>«{project.title}» desaparecerá para el equipo.</strong><p>Ya no podrán abrirla ni continuar sus tareas. Se conservarán documentos, originales e historial; seguirán contando en el límite de almacenamiento. Las publicaciones existentes en VISTA no se retirarán. Puedes restaurarla después.</p></div></div><label>Escribe el nombre exacto: {project.title}<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" required disabled={busy}/></label><label>Motivo de la eliminación<textarea value={reason} onChange={event=>setReason(event.target.value)} minLength={10} maxLength={2000} required disabled={busy}/></label><div className="gw-form-actions"><button type="submit" className="gw-danger" disabled={busy || confirmation!==project.title || reason.trim().length<10}>Confirmar eliminación</button><button type="button" disabled={busy} onClick={()=>setConfirming(false)}>Cancelar</button></div></form>}
    {error && <p role="alert" className="gw-error">{error}</p>}
  </div>;
}

export function RemovedProductions({ removed, onRestore, busy }) {
  const [error,setError]=useState('');
  async function restore(item){setError('');try{await onRestore(item);}catch(failure){setError(failure.message);}}
  if (!removed.length) return null;
  return <section className="gw-productions-removed" aria-labelledby="gw-productions-removed-title"><h3 id="gw-productions-removed-title">Producciones eliminadas</h3>
    {error && <p role="alert" className="gw-error">{error}</p>}
    <ul>{removed.map(item=><li key={item.id}><div><strong>{item.title}</strong><small>Eliminada {dateLabel(item.deleted_at)}{item.deletion_reason ? ` · ${item.deletion_reason}` : ''}</small></div><button type="button" disabled={busy} onClick={()=>void restore(item)}><RotateCcw size={15} aria-hidden="true"/>Restaurar</button></li>)}</ul>
  </section>;
}

export default function EditionRemoval({ project, removed, canRemove, onRemove, onRestore, busy }) {
  return <section className="gw-edition-removal">{project && canRemove && <RemoveProduction project={project} onRemove={onRemove} busy={busy}/>}<RemovedProductions removed={removed} onRestore={onRestore} busy={busy}/></section>;
}
