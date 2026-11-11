import React,{useEffect,useState} from 'react';
import {Archive,FileText} from 'lucide-react';
import EditionDocuments,{DocumentContent} from './EditionDocuments';
import StructuredDocument from './StructuredDocument';
import SupportDocuments from './SupportDocuments';
import ImageDelivery from './images/ImageDelivery';
import VideoReview from './video/VideoReview';
import VersionFile from './VersionFile';
import WorkConversation from './WorkConversation';
import DocumentInbox from './DocumentInbox';
import {EditionCalendar} from './EditionWork';
import {Status} from './workView';
import {dateLabel} from './gimgModel';
import {closedEditionData,consultationPermissions} from './editionState.mjs';
import {taskIsMine} from './documentModel';

export default function ClosedEdition({project,data,actorId,permissions,imageApi,videoApi,workApi,onSettings,initialTaskId,initialTarget,inboxApi,unitId}) {
  const [section,setSection]=useState(initialTarget?.delivery_id?'inbox':initialTarget?.support_id?'personal':initialTarget?.image_version_id||initialTaskId?'tasks':'documents'),[taskId,setTaskId]=useState(initialTaskId || ''),[versionId,setVersionId]=useState(''),[draft,setDraft]=useState(null),[error,setError]=useState('');
  const view=closedEditionData(data), tasks=data.tasks.filter(t=>t.project_id===project.id);
  const task=tasks.find(t=>t.id===taskId) || tasks[0];
  const versions=task?data.versions.filter(v=>v.deliverable_id===task.id).sort((a,b)=>b.version_number-a.version_number):[];
  const version=versions.find(v=>v.id===versionId) || versions[0];
  useEffect(()=>{setDraft(null);setError('');if(!task || ['image','video'].includes(task.kind) || !taskIsMine(task,actorId))return;
    let live=true;workApi('draft.get',task,{}).then(value=>{if(live)setDraft(value);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
  },[task?.id,task?.current_version,actorId,versions.length]);
  return <section className="gw-closed-edition">
    <header className="gw-closed-heading"><div><span><Archive size={16}/> {project.status==='archived'?'Archivada':'Cerrada'} · Sólo consulta</span><h1>{project.title}</h1><p>El trabajo y sus versiones se conservan. Para continuar editando, una persona autorizada debe reabrir la edición.</p></div>{permissions['project.update'] && <button type="button" onClick={onSettings}>Administrar edición</button>}</header>
    <nav className="gw-section-nav" aria-label="Consultar edición cerrada">{[['documents','Documentos'],['tasks','Trabajos'],['personal','Mis documentos'],['inbox','Bandeja'],['calendar','Calendario']].map(([id,label])=><button type="button" key={id} aria-current={section===id?'page':undefined} onClick={()=>setSection(id)}>{label}</button>)}</nav>
    {section==='documents' && <EditionDocuments key={project.id} project={project} data={view} actorId={actorId} permissions={consultationPermissions(permissions)} initialReferenceId={initialTarget?.reference_id} initialTaskId={initialTarget?.deliverable_id} onOpenTask={item=>{setTaskId(item.id);setVersionId('');setSection('tasks');}}/>}
    {section==='personal' && <SupportDocuments project={project} data={view} actorId={actorId} initialSupportId={initialTarget?.support_id} busy={false}/>}
    {section==='inbox' && <DocumentInbox unitId={unitId} inboxApi={inboxApi} initialDeliveryId={initialTarget?.delivery_id} anchorId={initialTarget?.anchor_id}/>}
    {section==='calendar' && <EditionCalendar actorId={actorId} project={project} data={view} permissions={{}} busy={false} onPick={item=>{setTaskId(item.id);setSection('tasks');}}/>}
    {section==='tasks' && <div className="gw-closed-work"><aside aria-label="Trabajos conservados">{tasks.map(item=><button type="button" key={item.id} aria-current={task?.id===item.id?true:undefined} onClick={()=>{setTaskId(item.id);setVersionId('');}}><strong>{item.title}</strong><Status state={item.state} kind={item.kind}/></button>)}{!tasks.length && <p>No hay trabajos accesibles en esta edición.</p>}</aside>
      <section className="gw-closed-paper">{task?<><h2>{task.title}</h2>{task.description && <p>{task.description}</p>}{task.kind==='video'?<VideoReview key={task.id} task={task} data={view} actorId={actorId} api={videoApi} busy={false} readOnly/>:task.kind==='image'?<>{view.images.drafts?.[task.id] && <div className="gw-section-nav"><button type="button" aria-pressed={versionId!=='draft'} onClick={()=>setVersionId('')}>Versiones enviadas</button><button type="button" aria-pressed={versionId==='draft'} onClick={()=>setVersionId('draft')}>Borrador privado conservado</button></div>}<ImageDelivery key={task.id} task={task} data={view} actorId={actorId} api={imageApi} busy={false} readOnly showSavedDraft={versionId==='draft'} initialNoteId={initialTarget?.image_note_id} initialVersionId={initialTarget?.image_version_id}/></>:<>
        {(versions.length>0 || draft) && <label>Versión conservada<select value={versionId==='draft'||!version?'draft':version.id} onChange={e=>setVersionId(e.target.value)}>{versions.map(v=><option value={v.id} key={v.id}>Versión {v.version_number} · {dateLabel(v.created_at)}</option>)}{draft && <option value="draft">Borrador privado conservado</option>}</select></label>}
        {version && versionId!=='draft'?<><VersionFile version={version} permissions={view.taskPermissions?.[task.id] || {}}/>{version.content_document?<StructuredDocument document={version.content_document}/>:<DocumentContent content={version.content_markdown || ''}/>} {version.credits && <p>Créditos: {version.credits}</p>}</>:draft?<><p>Borrador privado conservado · sólo consulta</p>{draft.content_document?<StructuredDocument document={draft.content_document}/>:<DocumentContent content={draft.content_markdown || ''}/>}</>:<p>No hay una versión enviada para este trabajo.</p>}
        {error && <p role="alert">{error}</p>}<WorkConversation task={task} data={view} busy={false}/>
      </>}</>:<div className="gw-empty"><FileText size={30}/><p>Selecciona un trabajo para consultarlo.</p></div>}</section>
    </div>}
  </section>;
}
