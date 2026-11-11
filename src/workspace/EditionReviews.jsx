import React, { useState } from 'react';
import { CommandForm, TaskList } from './ui';
import { DocumentContent } from './EditionDocuments';
import StructuredDocument from './StructuredDocument';
import VersionFile from './VersionFile';
import ReferenceSplit from './ReferenceSplit';
import WorkConversation from './WorkConversation';
import WorkOperations from './WorkOperations';
import ImageReview from './images/ImageReview';
import VideoReview from './video/VideoReview';
import { UltramarVersionFiles } from './UltramarPanel';
import { reviewAction, canReviewTask, nextStep, taskIsMine } from './documentModel';
import { dateLabel, STATES } from './gimgModel';

export default function EditionReviews({ project, data, task, command, busy, onPick, previewMode, actorId, imageApi, videoApi, initialNoteId, initialVersionId }) {
  const [filter, setFilter] = useState(() => task && !canReviewTask(task, data.taskPermissions?.[task.id] || {}, data.areas.find(area => area.id === task.area_id)) ? 'all' : 'pending');
  const [query, setQuery] = useState('');
  const [referenceOpen, setReferenceOpen] = useState(false),[imageVersion,setImageVersion]=useState(null);
  const scoped = data.tasks.filter(item => item.project_id === project.id && Object.entries(data.taskPermissions?.[item.id] || {}).some(([key, value]) => value && (key.startsWith('review.') || ['qa.approve', 'qa.block_release', 'publication.approve_final', 'publication.execute'].includes(key))));
  const priority = item => item.qa_blocked ? 0 : item.state === 'qa_approved' ? 1 : item.state === 'in_qa' ? 2 : item.state === 'review' ? 3 : 4;
  const pending = scoped.filter(item => canReviewTask(item, data.taskPermissions?.[item.id] || {}, data.areas.find(area => area.id === item.area_id))).sort((a,b) => priority(a) - priority(b));
  const queue = (filter === 'pending' ? pending : scoped.filter(item => item.current_version > 0)).filter(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selected = queue.find(item => item.id === task?.id) || queue[0];
  const permissions = selected && data.taskPermissions[selected.id];
  const area = selected && data.areas.find(item => item.id === selected.area_id);
  const candidate = selected && reviewAction(selected, permissions, area);
  const ownFinal = selected && (taskIsMine(selected, actorId) || data.versions.some(version => version.deliverable_id === selected.id && version.author_id === actorId));
  const action = candidate?.action === 'publication.approve' && ownFinal ? null : candidate;
  const version = selected && data.versions.find(item => item.deliverable_id === selected.id && item.version_number === selected.current_version);
  return <section className="gw-work-section"><div className="gw-work-heading"><div><h1>Revisión</h1><p>Atiende las entregas que requieren tu revisión, control de calidad o aprobación.</p></div><span>{pending.length} por atender</span></div>
    <div className="gw-work-filters"><label><span className="gw-sr-only">Mostrar revisiones</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">Por atender</option><option value="all">Todas las entregas</option></select></label><label><span className="gw-sr-only">Buscar entrega</span><input type="search" placeholder="Buscar entrega" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    <div className="gw-review-layout"><TaskList tasks={queue} onPick={onPick} selectedId={selected?.id} />{selected ? <ReferenceSplit task={selected} open={referenceOpen} project={project} data={data} onClose={() => setReferenceOpen(false)}><div className="gw-review-document"><button type="button" onClick={() => setReferenceOpen(current => !current)}>{referenceOpen ? 'Cerrar referencia' : 'Comparar con referencias'}</button><div className="gw-editor-header"><div><span className="gw-eyebrow">{area?.name} · {STATES[selected.state]}</span><h2>{selected.title}</h2><p>{data.members.find(member => member.user_id === selected.responsible_id)?.display_name || 'Integrante'} · Versión {selected.current_version}</p></div>{action && <button type="button" className="gw-primary" disabled={busy || ['image','video'].includes(selected.kind)&&imageVersion!==null&&imageVersion!==selected.current_version} onClick={() => void command(action.action, { image:selected.kind==='image',video:selected.kind==='video',deliverable_id: selected.id, ...(action.state ? { state: action.state } : {}) }, selected.revision)}>{action.label}</button>}</div>
      <p className="gw-work-notice">{candidate?.action === 'publication.approve' && ownFinal ? 'Otra persona con autoridad de Dirección debe aprobar finalmente esta entrega porque participaste en su autoría.' : nextStep(selected)}</p><article className="gw-reviewed-paper" hidden={['image','video'].includes(selected.kind)}><VersionFile version={version} permissions={permissions} previewMode={previewMode} /><UltramarVersionFiles version={version} data={data} previewMode={previewMode} />{!version?.content_markdown && !version?.content_document && version?.has_file && <p>Esta entrega está en el archivo enlazado. Ábrelo para realizar la revisión.</p>}{version?.content_document ? <StructuredDocument document={version.content_document} /> : <DocumentContent content={version?.content_markdown || 'Todavía no hay contenido entregado.'} />}{version?.credits && <footer className="gw-document-credits"><h3>Créditos</h3><p>{version.credits}</p></footer>}<small>{dateLabel(version?.created_at)}</small></article>
      {selected.kind==='video'&&<VideoReview key={selected.id} task={selected} data={data} actorId={actorId} api={videoApi} command={command} busy={busy} onVersionChange={setImageVersion}/>}
      {selected.kind==='image'&&<ImageReview key={selected.id} task={selected} data={data} actorId={actorId} api={imageApi} command={command} busy={busy} initialNoteId={initialNoteId} initialVersionId={initialVersionId} onVersionChange={setImageVersion}/>}
      {selected.kind!=='image'&&['review', 'in_qa'].includes(selected.state) && permissions['review.request_changes'] && (selected.state !== 'in_qa' || permissions['qa.approve']) && <details className="gw-return-document"><summary>Solicitar correcciones</summary>{selected.round >= 1 + selected.extra_rounds ? <p>La ronda de correcciones ya se utilizó. Dirección debe autorizar otra antes de devolver el documento.</p> : <CommandForm busy={busy} fields={{ body: { label: 'Qué debe corregir la persona', type: 'textarea' } }} button="Devolver con correcciones" onSave={values => command('review.changes', { ...values, deliverable_id: selected.id }, selected.revision)} />} </details>}
      <div className="gw-review-controls"><WorkOperations task={selected} permissions={permissions} command={command} busy={busy} review /></div>
      <WorkConversation task={selected} data={data} command={command} busy={busy} />
    </div></ReferenceSplit> : <div className="gw-work-empty"><h3>No hay versiones pendientes de tu revisión.</h3><p>Las entregas aparecerán aquí cuando requieran una acción tuya. Puedes consultar las anteriores en «Todas las entregas».</p></div>}</div>
  </section>;
}
