import {deadlineStatus,deliveryGroup,withDeadlineFacts} from './deadlines.mjs';
import {DeliverySummary,DeliveryGroups,TaskDates} from './DeadlineViews';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarClock, FileText, Inbox, Plus, Search } from 'lucide-react';
import WorkEditor from './WorkEditor';
import ImageDelivery from './images/ImageDelivery';
import ImageSpecForm from './images/ImageSpecForm';
import VideoDelivery from './video/VideoDelivery';
import VideoKindForm from './video/VideoKindForm';
import VideoPublications from './video/VideoPublications';
import { productionNoun } from './productionKinds.mjs';
import { CommandForm, choices } from './ui';
import { PRIORITIES, dateLabel } from './gimgModel';
import WorkConversation from './WorkConversation';
import WorkOperations from './WorkOperations';
import { taskIsMine, canReviewTask, nextStep, hasReviewPermission } from './documentModel';
import TaskMaterials from './TaskMaterials';
import { UltramarPrepare, UltramarOpen } from './UltramarPanel';
import ReferenceSplit from './ReferenceSplit';
import SupportDocuments from './SupportDocuments';
import DocumentInbox from './DocumentInbox';
import DraftExitDialog from './DraftExitDialog';
import { Avatar, CLOSED_STATES, DueLabel, Status, dateShort, dueInfo } from './workView';

/* Mi trabajo y Asignaciones · Workspace 1.5.7 (rediseño visual).
   Los permisos (taskPermissions, areaPermissions, taskIsMine, permisos de revisión)
   y los comandos son los mismos que antes; sólo cambia la presentación. */

export function CreateWork({ project, data, actorId, personal, command, busy, onCreated }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const createTrigger = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = event => { if (root.current && !root.current.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); createTrigger.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', escape); };
  }, [open]);
  const areas = data.areas.filter(area => area.project_id === project.id && data.areaPermissions?.[area.id]?.['task.create'] && (personal || data.areaPermissions?.[area.id]?.['task.assign']));
  if (!areas.length) return null;
  return <details ref={root} open={open} onToggle={event => setOpen(event.currentTarget.open)} className="gw-wk-create">
    <summary ref={createTrigger} className={`gw-wk-btn${personal ? '' : ' gw-wk-btn-primary'}`}><Plus size={16} aria-hidden="true" />{personal ? 'Nueva entrega' : 'Nueva asignación'}</summary>
    <div className="gw-wk-popover">
      <h3>{personal ? 'Nueva entrega' : 'Nueva asignación'}</h3>
      <p>{personal ? 'Se crea como entrega privada para que empieces a trabajar.' : 'Indica qué debe entregar la persona, en qué área y quién lo realiza.'}</p>
      <CommandForm resetOnSuccess initial={{ area_id: areas.length === 1 ? areas[0].id : '' }} busy={busy} button={personal ? 'Crear entrega y empezar' : 'Asignar trabajo'} fields={{ title: personal ? 'Título de la entrega' : 'Título de la asignación', ...(personal ? {} : { description: { label: 'Qué debe realizar y entregar esta persona', type: 'richtext', scope:{kind:'assignment',projectId:project.id} } }), area_id: { label: 'Área', options: choices(areas, 'name') }, ...(personal ? {} : { responsible_id: { label: 'Asignar a', options: choices(data.members, 'display_name'), optional: true } }) }} onSave={async values => { const task = await command('task.create', { ...values, responsible_id: personal ? actorId : values.responsible_id }); if (task) { onCreated(task); setOpen(false); createTrigger.current?.focus(); } return task; }} />
    </div>
  </details>;
}

const WORK_GROUPS = [
  ['attention', 'Necesita tu atención', ['changes_requested', 'blocked']],
  ['doing', 'En curso', ['in_progress', 'assigned', 'pending']],
  ['sent', 'En revisión', ['review']]
];
const groupOf = state => (WORK_GROUPS.find(([, , states]) => states.includes(state))?.[0]) || 'closed';

export function PersonalWork({ project, data, task, actorId, command, api, busy, onPick, previewMode, onDirtyChange, onReference, referenceApi, supportApi, inboxApi, unitId, initialSupportId, initialDeliveryId, initialAnchorId, imageApi, videoApi, initialImageNoteId, initialImageVersionId, ultramarApi }) {
  const [filter, setFilter] = useState(() => task && deliveryGroup(task)==='delivered' ? 'sent' : 'active');
  const [focus, setFocus] = useState(false);
  const [split, setSplit] = useState(false);
  const [view, setView] = useState(() => initialDeliveryId ? 'inbox' : initialSupportId ? 'support' : 'deliveries');
  const [createRequest,setCreateRequest]=useState(0);
  const [workDirty, setWorkDirty] = useState(false);
  const [supportDirty, setSupportDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const anyDirty = workDirty || supportDirty;
  const order = { changes_requested: 0, blocked: 1, in_progress: 2, assigned: 3, pending: 3, review: 4 };
  const mine = data.tasks.filter(item => item.project_id === project.id && taskIsMine(item, actorId)).map(t=>withDeadlineFacts(t,data)).sort((a,b) => (order[a.state] ?? 5) - (order[b.state] ?? 5) || (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity));
  const tasks = mine.filter(item => deliveryGroup(item)===(filter==='sent'?'delivered':'pending'));
  const selected = tasks.find(item => item.id === task?.id) || tasks[0];
  const pending = mine.filter(item => deliveryGroup(item)==='pending').length;
  const groups = [{id:'deliveries',label:filter==='sent'?'Entregado':'Por entregar',items:tasks}].filter(g=>g.items.length);
  useEffect(() => { onDirtyChange?.(anyDirty); }, [anyDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { if (initialSupportId) changeView('support'); }, [initialSupportId]);
  useEffect(() => { if (initialDeliveryId) changeView('inbox'); }, [initialDeliveryId]);
  function newDocument() {
    if(view==='support'){setCreateRequest(n=>n+1);return;}
    requestNavigation(() => { setView('support');setCreateRequest(n=>n+1); });
  }
  function requestNavigation(action) { if (anyDirty) setPendingNavigation(() => action); else action(); }
  function openTask(target) { if (target?.id !== task?.id) requestNavigation(() => onPick?.(target)); }
  function changeView(next) { if (next === view) return; requestNavigation(() => setView(next)); }
  return <section className="gw-wk gw-wk-mine" data-focus={selected && focus || undefined} data-split={selected && split || undefined} data-compact={selected && (focus || split) || undefined}>
    {focus && <h1 className="gw-sr-only">Mi trabajo</h1>}
    <div className="gw-wk-head"><div><h1>Mi trabajo</h1><p>Crea documentos, continúa tus entregas y consulta lo que te enviaron.</p></div>{view === 'deliveries' && <CreateWork project={project} data={data} actorId={actorId} personal command={command} busy={busy} onCreated={openTask} />}</div>
    <div className="gw-opal-inbox-tabs" role="group" aria-label="Cambiar vista de Mi trabajo"><button type="button" aria-pressed={view === 'deliveries'} onClick={() => changeView('deliveries')}>Entregas</button><button type="button" aria-pressed={view === 'support'} onClick={() => changeView('support')}>Documentos <span>{data.support?.documents?.filter(row => row.author_id === actorId || row.share_scope !== 'private').length || 0}</span></button><button type="button" aria-pressed={view === 'inbox'} onClick={() => changeView('inbox')}>Bandeja de entrada</button></div>
    {view==='deliveries'&&<DeliverySummary tasks={mine} personal/>}
    {view === 'inbox' ? <DocumentInbox unitId={unitId} inboxApi={inboxApi} initialDeliveryId={initialDeliveryId} anchorId={initialAnchorId} /> : view === 'support' ? <SupportDocuments createRequest={createRequest} inboxApi={inboxApi} initialAnchorId={initialAnchorId} project={project} data={data} actorId={actorId} supportApi={supportApi} busy={busy} onDirtyChange={setSupportDirty} onOpenTask={openTask} initialSupportId={initialSupportId} /> : <div className="gw-wk-mine-layout">
      <aside className="gw-wk-rail" aria-label="Lista de mi trabajo">
        <div className="gw-wk-seg" role="group" aria-label="Mostrar mi trabajo">
          <button type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Por entregar <span>{pending}</span></button>
          <button type="button" aria-pressed={filter === 'sent'} onClick={() => setFilter('sent')}>Entregado <span>{mine.length-pending}</span></button>
        </div>
        {groups.map(group => <div key={group.id} className="gw-wk-group" role="group" aria-label={group.label}>
          <h2 className="gw-wk-group-label">{group.label}</h2>
          <ul className="gw-wk-items">{group.items.map(item => <li key={item.id}><button type="button" className="gw-wk-work-item" aria-current={selected?.id === item.id || undefined} onClick={() => openTask(item)}>
            <strong>{item.title}</strong>{item.kind==='image'&&<span className="gw-wk-tag">Imagen · {item.current_version?`v${item.current_version}`:data.images?.drafts?.[item.id]?'Borrador':'Sin entregar'} · {project.title}</span>}{item.kind==='video'&&<span className="gw-wk-tag">Video · {item.current_version?`v${item.current_version}`:'Sin entregar'} · {project.title}</span>}
            <span className="gw-wk-work-meta"><Status state={item.state} kind={item.kind} /><DueLabel task={item} /></span>
            {item.kind==='image'&&<span className="gw-image-entry">{['assigned','in_progress','changes_requested','pending'].includes(item.state)?'Entregar imagen →':'Ver imagen y notas →'}</span>}{item.kind==='video'&&<span className="gw-image-entry">{['assigned','in_progress','changes_requested','pending'].includes(item.state)?'Subir video →':'Ver video y comentarios →'}</span>}{item.block_reason && <span className="gw-wk-work-reason">{item.block_reason}</span>}
          </button></li>)}</ul>
        </div>)}
        {!tasks.length && <p className="gw-wk-rail-empty">{filter === 'active' && mine.length ? 'No tienes entregas pendientes. Cambia a «Entregado» para ver lo enviado a revisión y lo aprobado.' : 'Aquí aparecerán tus entregas asignadas.'}</p>}
      </aside>
      {selected
        ? <div className="gw-deadline-editor"><TaskDates task={withDeadlineFacts(selected,data)}/><UltramarOpen task={selected} data={data} previewMode={previewMode}/>{data.areas.find(a=>a.id===selected.area_id)?.specialty==='social'&&<VideoPublications project={project} data={data} actorId={actorId} api={videoApi} busy={busy}/>}{selected.kind==='video' ? <><VideoDelivery key={selected.id} task={selected} data={data} actorId={actorId} api={videoApi} command={command} busy={busy} onDirtyChange={setWorkDirty}/><WorkConversation task={selected} data={data} command={command} busy={busy} /></> : selected.kind==='image' ? <><ImageDelivery key={selected.id} task={selected} data={data} actorId={actorId} api={imageApi} command={command} busy={busy} onDirtyChange={setWorkDirty} initialNoteId={initialImageNoteId} initialVersionId={initialImageVersionId}/><WorkConversation task={selected} data={data} command={command} busy={busy} /></> : <WorkEditor key={selected.id} task={selected} data={data} actorId={actorId} api={api} command={command} previewMode={previewMode} busy={busy} onDirtyChange={setWorkDirty} onReference={onReference} focus={focus} onFocusChange={setFocus} onSplitChange={setSplit} referenceApi={referenceApi} />}</div>
        : <div className="gw-wk-empty"><FileText size={30} aria-hidden="true" /><h2>No tienes entregas pendientes en esta {productionNoun(project)}.</h2><p>Puedes crear un documento ahora, escribir en privado y enviarlo a otra persona. Tus asignaciones aparecerán en esta pestaña cuando las recibas.</p><div className="gw-mywork-actions"><button type="button" className="gw-wk-btn gw-wk-btn-primary" disabled={busy || !data.support?.creation_areas?.length} onClick={newDocument}><Plus size={16}/>Nuevo documento</button><button type="button" className="gw-wk-btn" onClick={onReference}>Consultar referencias de la {productionNoun(project)}</button></div></div>}
    </div>}{pendingNavigation && <DraftExitDialog onStay={() => setPendingNavigation(null)} onDiscard={() => { const navigate=pendingNavigation; setPendingNavigation(null); setWorkDirty(false); setSupportDirty(false); onDirtyChange?.(false); navigate(); }} />}
  </section>;
}

const FILTERS = [['all','Todo'],['late','Vencidas'],['soon','Vencen pronto'],['unassigned','Sin responsable'],['blocked','Bloqueado']];

export function AreaAssignments({ project, data, task, command, busy, onPick, onReview, referenceApi, imageApi, videoApi, ultramarApi }) {
  const [query, setQuery] = useState('');
  const [referenceTarget,setReferenceTarget] = useState(null);
  const [filter, setFilter] = useState('all');
  const [personId,setPersonId]=useState('');
  const [areaId, setAreaId] = useState('');
  const scoped = data.tasks.filter(item => item.project_id === project.id && data.taskPermissions?.[item.id]?.['task.assign']).map(t=>withDeadlineFacts(t,data));
  const areas = data.areas.filter(area => area.project_id === project.id && data.areaPermissions?.[area.id]?.['task.assign']);
  const matches=(item,key=filter)=>key==='all'||(key==='blocked'?item.state==='blocked':key==='unassigned'?!item.responsible_id:key==='late'?deadlineStatus(item).key==='late':['soon','today'].includes(deadlineStatus(item).key));
  const nameOf = id => data.members.find(member => member.user_id === id)?.display_name || '';
  const tasks = scoped.filter(item => matches(item) && (!personId || item.responsible_id===personId || item.collaborator_ids?.includes(personId)) && (!areaId || item.area_id === areaId) && `${item.title} ${nameOf(item.responsible_id)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selected = tasks.find(item => item.id === task?.id) || tasks[0];
  const permissions = selected && data.taskPermissions[selected.id];
  const area = selected && data.areas.find(item => item.id === selected.area_id);
  const dependencies = selected ? (data.dependencies || []).filter(item => item.deliverable_id === selected.id) : [];
  const canReview = selected && canReviewTask(selected, permissions, area);
  const editable = selected && ['pending', 'assigned', 'in_progress', 'review', 'changes_requested', 'blocked'].includes(selected.state);
  return <section className="gw-wk gw-wk-team">
    <div className="gw-wk-head"><div><h1>Asignaciones</h1><p>Organiza el trabajo de {areas.length === 1 ? areas[0].name : `la ${productionNoun(project)}`}: quién lo realiza, qué entrega y cuándo.</p></div><CreateWork project={project} data={data} command={command} busy={busy} onCreated={onPick} /></div>
    <DeliverySummary tasks={scoped} noun={productionNoun(project)}/>
    <div className="gw-wk-toolbar">
      <label className="gw-wk-search"><span className="gw-sr-only">Buscar asignación o persona</span><Search size={16} aria-hidden="true" /><input type="search" placeholder="Buscar trabajo o persona" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="gw-wk-chipset" role="group" aria-label="Filtrar asignaciones">{FILTERS.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}{key !== 'all' && <span>{scoped.filter(item => matches(item, key)).length}</span>}</button>)}</div>
      {areas.length > 1 && <label className="gw-wk-areafilter"><span className="gw-sr-only">Filtrar por área</span><select value={areaId} onChange={event => setAreaId(event.target.value)}><option value="">Todas las áreas</option>{areas.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label className="gw-wk-areafilter">Persona<select aria-label="Filtrar por persona" value={personId} onChange={e=>setPersonId(e.target.value)}><option value="">Todas las personas</option>{data.members.filter(m=>scoped.some(t=>t.responsible_id===m.user_id||t.collaborator_ids?.includes(m.user_id))).map(m=><option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
      <span className="gw-wk-count" role="status">{tasks.length} {tasks.length === 1 ? 'trabajo' : 'trabajos'}</span>
    </div>
    <div className="gw-wk-team-layout">
      <div className="gw-wk-list">
        <DeliveryGroups tasks={tasks} renderItem={item => { const person = nameOf(item.responsible_id); const due = deadlineStatus(item); return <li key={item.id}><button type="button" className="gw-wk-assign-item" aria-current={selected?.id === item.id || undefined} onClick={() => onPick(item)}>
          <Avatar name={person} />
          <span className="gw-wk-assign-main">
            <strong>{item.title}</strong>{item.kind==='image'&&<span className="gw-wk-tag">Imagen · {item.current_version?`v${item.current_version}`:data.images?.drafts?.[item.id]?'Borrador':'Sin entregar'} · {project.title}</span>}{item.kind==='video'&&<span className="gw-wk-tag">Video · {item.current_version?`v${item.current_version}`:'Sin entregar'} · {project.title}</span>}
            <span className="gw-wk-assign-sub">{person || <em>Sin responsable</em>}{areas.length > 1 && ` · ${data.areas.find(row => row.id === item.area_id)?.name || ''}`}</span>
            <span className="gw-wk-assign-foot"><Status state={item.state} kind={item.kind} />{['high', 'urgent'].includes(item.priority) && <span className="gw-wk-tag" data-tone={item.priority}>{PRIORITIES[item.priority]}</span>}<DueLabel task={item}/></span>
          </span>
        </button></li>; }}/>
        {!tasks.length && <div className="gw-wk-list-empty"><Inbox size={22} aria-hidden="true" />{scoped.length ? <><p>Ninguna asignación coincide con la búsqueda o el filtro.</p><button type="button" className="gw-wk-btn" onClick={() => { setQuery(''); setFilter('all'); setAreaId(''); setPersonId(''); }}>Mostrar todas las asignaciones</button></> : <p>Todavía no hay asignaciones en tu área.</p>}</div>}
      </div>
      {selected ? <ReferenceSplit open={Boolean(referenceTarget)} initialReferenceId={referenceTarget} task={selected} project={project} data={data} onClose={()=>setReferenceTarget(null)}><section className="gw-wk-detail" aria-label={`Asignación: ${selected.title}`}>
        <div className="gw-wk-detail-head">
          <span className="gw-wk-eyebrow">{area?.name}</span>
          <h2>{selected.title}</h2>
          <div className="gw-wk-chips">
            <Status state={selected.state} />
            <span className="gw-wk-chip"><Avatar name={nameOf(selected.responsible_id)} />{nameOf(selected.responsible_id) || 'Sin responsable'}</span>

            {['high', 'urgent'].includes(selected.priority) && <span className="gw-wk-tag" data-tone={selected.priority}>Prioridad {PRIORITIES[selected.priority].toLowerCase()}</span>}
          </div>
        </div>
        <TaskDates task={selected}/><div className="gw-wk-nextstep"><ArrowRight size={16} aria-hidden="true" /><p>{nextStep(selected)}</p>{canReview && <button type="button" className="gw-wk-btn gw-wk-btn-primary" onClick={() => onReview(selected)}>Atender entrega en Revisión</button>}</div>
        <div className="gw-wk-detail-grid">
          <div className="gw-wk-col">
            <section className="gw-wk-card"><h3>Asignación</h3>
              {editable ? <CommandForm key={selected.id + selected.revision} initial={selected} busy={busy} fields={{ title: 'Título de la asignación', description: { label: 'Indicaciones para la persona', type: 'richtext', scope:{kind:'assignment',taskId:selected.id,projectId:project.id,areaId:selected.area_id} }, responsible_id: { label: 'Responsable', options: choices(data.members, 'display_name'), optional: true } }} button="Guardar asignación" onSave={values => command('task.save', { ...values, deliverable_id: selected.id, collaborator_ids: selected.collaborator_ids || [] }, selected.revision)} /> : <p className="gw-wk-note">La versión está aceptada. Su contenido y asignación se conservan.</p>}
            </section>
            <VideoKindForm key={`video-kind-${selected.id}-${selected.revision}`} task={selected} project={project} video={data.video} api={videoApi} busy={busy} editable={Boolean(editable)&&Boolean(permissions?.['task.assign'])}/>
            {data.areas.find(a=>a.id===selected.area_id)?.specialty==='social'&&<VideoPublications project={project} data={data} api={videoApi} busy={busy}/>}
            {data.images?.enabled&&selected.kind!=='video'&&<ImageSpecForm noun={productionNoun(project)} key={`spec-${selected.id}-${selected.revision}`} task={selected} spec={data.images.specs?.[selected.id]} api={imageApi} busy={busy} editable={Boolean(editable)&&(data.images.uploads_enabled??data.images.policy?.images_enabled)}/>}
            {ultramarApi&&<UltramarPrepare key={`ultramar-${selected.id}-${selected.revision}`} task={selected} data={data} api={ultramarApi} busy={busy} editable={Boolean(editable)}/>}
            <TaskMaterials task={selected} data={data} editable={Boolean(editable)} referenceApi={referenceApi} onOpen={row=>setReferenceTarget(row.reference_id)}/><WorkConversation task={selected} data={data} command={command} busy={busy} />
          </div>
          <div className="gw-wk-col gw-wk-side">
            {permissions['task.update_schedule'] && <details className="gw-wk-fold"><summary><span>Límite de entrega y prioridad</span><small>{dateShort(selected.due_at)} · {PRIORITIES[selected.priority] || 'Normal'}</small></summary><CommandForm key={`schedule-${selected.id}-${selected.revision}`} initial={selected} busy={busy} button="Guardar fecha" fields={{ due_at: { label: 'Límite de entrega', type: 'deadline', optional: true }, priority: { label: 'Prioridad', options: { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' } } }} onSave={values => command('task.schedule', { ...values, deliverable_id: selected.id }, selected.revision)} /></details>}
            <details className="gw-wk-fold"><summary><span>Trabajo que debe completarse primero</span><small>{dependencies.length ? `${dependencies.length} previo${dependencies.length === 1 ? '' : 's'}` : 'Ninguno'}</small></summary><p>Una dependencia evita iniciar o publicar este encargo antes de que el trabajo indicado esté publicado o archivado.</p>{dependencies.map(item => { const previous = data.tasks.find(row => row.id === item.depends_on_id); return <p key={item.depends_on_id} className="gw-wk-dependency">{previous?.title || 'Trabajo relacionado'}{previous && <Status state={previous.state} />}</p>; })}<CommandForm key={`dependency-${selected.id}`} busy={busy} button="Añadir dependencia" fields={{ depends_on_id: { label: 'Trabajo previo', options: choices(scoped.filter(item => item.id !== selected.id)) } }} onSave={values => command('dependency.add', { ...values, deliverable_id: selected.id }, selected.revision)} /></details>
            <WorkOperations task={selected} permissions={permissions} command={command} busy={busy} />
          </div>
        </div>
      </section></ReferenceSplit> : <div className="gw-wk-empty"><Inbox size={30} aria-hidden="true" /><h2>Selecciona una asignación</h2><p>{scoped.length ? 'Elige una de la lista para ver sus indicaciones, su fecha y a quién está asignada.' : 'Cuando crees una asignación, aparecerá aquí con su responsable y su fecha.'}</p></div>}
    </div>
  </section>;
}

export function EditionCalendar({ actorId, project, data, permissions, command, busy, onPick }) {
  const events = data.events.filter(event => event.project_id === project.id).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  return <section className="gw-work-section"><h2>Calendario de la {productionNoun(project)}</h2><p>Entregas, revisiones y fechas editoriales de {project.title}.</p>
    {permissions['task.update_schedule'] && <details className="gw-disclosure"><summary>Añadir fecha</summary><CommandForm busy={busy} button="Añadir hito" fields={{ title: 'Título', kind: { label: 'Tipo', options: { milestone: 'Hito', review: 'Revisión', editorial: 'Fecha editorial' } }, starts_at: { label: 'Inicio', type: 'datetime-local' }, ends_at: { label: 'Fin', type: 'datetime-local', optional: true } }} onSave={values => command('event.save', values)} /></details>}
    {!events.length && <p className="gw-empty">Todavía no hay fechas registradas para esta {productionNoun(project)}.</p>}
    <div className="gw-list">{events.map(event => <article key={event.id}><h3>{event.title}</h3><p>{dateLabel(event.starts_at)}{event.ends_at && ` → ${dateLabel(event.ends_at)}`} · {{ milestone: 'Hito', review: 'Revisión', editorial: 'Fecha editorial', deadline: 'Entrega' }[event.kind] || event.kind}</p>{event.kind==='deadline'&&data.tasks.find(t=>t.id===event.deliverable_id)&&<TaskDates task={withDeadlineFacts(data.tasks.find(t=>t.id===event.deliverable_id),data)}/>}<span className="gw-sr-only">Las fechas límite usan Ciudad de México.</span>{event.deliverable_id && data.tasks.some(task => task.id === event.deliverable_id && (taskIsMine(task, actorId) || data.taskPermissions?.[task.id]?.['task.assign'] || hasReviewPermission(data.taskPermissions?.[task.id] || {}) || data.approvedDocuments?.some(document => document.deliverable_id === task.id))) && <button type="button" onClick={() => onPick(data.tasks.find(task => task.id === event.deliverable_id))}>Abrir trabajo</button>}{permissions['task.update_schedule'] && event.kind !== 'deadline' && <details className="gw-disclosure"><summary>Modificar fecha</summary><CommandForm key={`${event.id}-${event.revision}`} initial={event} busy={busy} fields={{ title: 'Título', starts_at: { label: 'Inicio', type: 'datetime-local' }, ends_at: { label: 'Fin', type: 'datetime-local', optional: true } }} button="Guardar fecha" onSave={values => command('event.save', { ...values, id: event.id, kind: event.kind }, event.revision)} /></details>}</article>)}</div>
  </section>;
}
