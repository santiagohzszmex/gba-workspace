import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Hourglass, Lock, Maximize2, Minimize2, PanelLeftOpen } from 'lucide-react';
const RichDocument = React.lazy(() => import('./RichDocument'));
import { productionNoun } from './productionKinds.mjs';
import { DocumentContent } from './EditionDocuments';
import StructuredDocument from './StructuredDocument';
import ReferenceSplit from './ReferenceSplit';
import VersionFile from './VersionFile';
import WorkConversation from './WorkConversation';
import WorkOperations from './WorkOperations';
import { EDITABLE_STATES, documentText, nextStep } from './documentModel';
import { dateLabel } from './gimgModel';
import { DueLabel, Status, savedLabel } from './workView';
import { readRecovery, writeRecovery, clearRecovery } from './draftRecovery';
import TaskMaterials from './TaskMaterials';

export default function WorkEditor({ task, data, actorId, api, command, onDirtyChange, busy, onReference, previewMode, focus = false, onFocusChange, onSplitChange, referenceApi }) {
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceTarget,setReferenceTarget] = useState(null);
  const [payload, setPayload] = useState(null);
  const [saved, setSaved] = useState(null);
  const [working, setWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [autoSaving, setAutoSaving] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [editorKey, setEditorKey] = useState(0);
  const latest = useRef(null), stored = useRef(null), saving = useRef(null), mounted = useRef(true), restored = useRef(false), ready = useRef(false);
  const [loading, setLoading] = useState(true);
  const baseline = useRef('');
  const permissions = data.taskPermissions?.[task.id] || {};
  const editable = permissions['content.edit_assigned'] && EDITABLE_STATES.includes(task.state);
  const version = data.versions.find(item => item.deliverable_id === task.id && item.version_number === task.current_version);
  const staleDraft = Boolean(saved && saved.base_version !== task.current_version);
  const dirty = payload !== null && JSON.stringify(payload) !== baseline.current;
  const area = data.areas.find(item => item.id === task.area_id);
  latest.current = payload;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(''); restored.current = false;
    (async () => {
      try {
        const draft = editable ? await api('draft.get', task, {}) : null;
        if (!live) return;
        const values = { content_document: draft?.content_document || version?.content_document || null, content_markdown: draft?.content_markdown ?? version?.content_markdown ?? '', credits: draft?.credits ?? version?.credits ?? '', asset_url: draft?.asset_url || '' };
        baseline.current = JSON.stringify(values); stored.current = draft; setSaved(draft); setPayload(values); ready.current = false;
        const copy = editable ? readRecovery(actorId, task.id) : null;
        setRecovery(copy && JSON.stringify(copy.payload) !== JSON.stringify(values) && copy.updatedAt > new Date(draft?.updated_at || 0).getTime() ? copy : null);
      } catch (failure) { if (live) setError(failure.message); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [task.id, task.current_version, task.state, actorId]);
  useEffect(() => { onSplitChange?.(referenceOpen); return () => onSplitChange?.(false); }, [referenceOpen, onSplitChange]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => { if (!dirty) return; const warn = event => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  useEffect(() => {
    if (!dirty || !ready.current || !editable || recovery || staleDraft || working || busy || error) return;
    const timer = setTimeout(() => { void save(false, true); }, 5000);
    return () => clearTimeout(timer);
  }, [payload, dirty, editable, recovery, staleDraft, working, busy, error]);
  useEffect(() => {
    if (!dirty || !editable || !ready.current) return;
    const timer = setTimeout(() => { try { writeRecovery(actorId, task.id, latest.current, stored.current?.revision || 0, task.current_version); } catch {} }, 300);
    return () => { clearTimeout(timer); if (latest.current && JSON.stringify(latest.current) !== baseline.current) { try { writeRecovery(actorId, task.id, latest.current, stored.current?.revision || 0, task.current_version); } catch {} } };
  }, [payload, dirty, editable, actorId, task.id, task.current_version]);
  function change(content, initial = false) {
    setPayload(current => {
      const next = { ...current, ...content };
      if (initial && !restored.current) baseline.current = JSON.stringify({ ...JSON.parse(baseline.current), ...content });
      ready.current = true;
      return next;
    });
  }
  async function persist(quiet = false) {
    while (saving.current) await saving.current;
    const snapshot = latest.current;
    const previous = stored.current;
    if (JSON.stringify(snapshot) === baseline.current && previous && previous.base_version === task.current_version) return previous;
    if (!snapshot?.content_document) throw Error('Espera a que se abra el editor.');
    if (snapshot.asset_url && !/^https:\/\//i.test(snapshot.asset_url.trim())) throw Error('Usa un enlace HTTPS para el archivo.');
    const promise = api('draft.save', task, { data: { ...snapshot, editor_version: 2 }, revision: previous?.revision || 0, base_version: task.current_version, quiet });
    saving.current = promise;
    try {
      const draft = await promise;
      stored.current = draft; baseline.current = JSON.stringify(snapshot);
      if (JSON.stringify(latest.current) === baseline.current) clearRecovery(actorId, task.id);
      if (mounted.current) { setSaved(draft); onDirtyChange(JSON.stringify(latest.current) !== baseline.current); }
      return draft;
    } finally { if (saving.current === promise) saving.current = null; }
  }
  async function save(send, quiet = false) {
    if (!editable || sending || (quiet && recovery)) return;
    if (quiet) setAutoSaving(true); else { setWorking(true); setSending(Boolean(send)); }
    setError('');
    try {
      const draft = await persist(quiet);
      if (send) { await api('draft.submit', task, { draft_revision: draft.revision, task_revision: task.revision }); clearRecovery(actorId, task.id); }
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) { setWorking(false); setSending(false); setAutoSaving(false); } }
  }
  function recover() { restored.current = true; setPayload(recovery.payload); latest.current = recovery.payload; setEditorKey(value => value + 1); setRecovery(null); setError(''); }
  if (loading) return <p role="status" className="gw-loading gw-wk-loading">Abriendo tu documento…</p>;
  const comments = data.comments.filter(comment => comment.deliverable_id === task.id && comment.kind === 'changes');
  const latestChange = task.state === 'changes_requested' && comments.length ? [...comments].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0] : null;
  const changeAuthor = latestChange && data.members.find(member => member.user_id === latestChange.actor_id)?.display_name;
  const saveState = working || autoSaving ? 'saving' : error && dirty ? 'error' : dirty ? 'dirty' : saved ? 'saved' : 'new';
  const saveText = { saving: 'Guardando…', dirty: 'Cambios sin guardar', saved: `Borrador guardado · ${savedLabel(saved?.updated_at)}`, new: 'Tu borrador', error: 'Cambios pendientes de guardar. Reintenta con Guardar borrador.' }[saveState];
  const cannotSend = !permissions['content.request_review'];
  const readOnly = task.state === 'review' ? { tone: 'wait', Icon: Hourglass, text: 'Enviaste esta versión a revisión. Aquí verás si el responsable solicita cambios o acepta el documento.' }
    : ['area_approved','in_qa','qa_approved','published','archived'].includes(task.state) ? { tone: 'ok', Icon: CheckCircle2, text: 'Esta versión ya fue aceptada. Puedes consultarla en Documentos.' }
    : !permissions['content.edit_assigned'] ? { tone: 'idle', Icon: Lock, text: 'Tu cargo no permite editar este trabajo. Puedes consultarlo en modo de lectura.' }
    : { tone: 'idle', Icon: Lock, text: 'Este trabajo no se puede editar en su estado actual.' };
  return <ReferenceSplit open={referenceOpen} project={data.projects.find(item => item.id === task.project_id)} data={data} onClose={() => setReferenceOpen(false)} task={task} initialReferenceId={referenceTarget}><section className="gw-wk-sheet" aria-label={`Trabajo: ${task.title}`}>
    <div className="gw-wk-sheet-head">
      <div className="gw-wk-sheet-title">
        <h2 title={task.title}>{task.title}</h2>
        <div className="gw-wk-meta">{area && <span>{area.name}</span>}<Status state={task.state} /><span>Límite <DueLabel task={task} /></span></div>
      </div>
      <div className="gw-wk-sheet-actions">
        {editable && payload && <>
          <span role="status" className="gw-wk-savestate" data-state={saveState}><i aria-hidden="true" />{saveText}</span>
          <button type="button" className="gw-wk-btn" disabled={working || busy || (!dirty && Boolean(saved) && !staleDraft)} onClick={() => void save(false)}>{working && !sending ? 'Guardando…' : 'Guardar borrador'}</button>
          <button type="button" className="gw-wk-btn gw-wk-btn-primary" title={cannotSend ? 'Tu cargo no incluye enviar a revisión.' : undefined} disabled={working || busy || staleDraft || cannotSend || (!documentText(payload.content_document).trim() && !payload.asset_url)} onClick={() => void save(true)}>{working && sending ? 'Enviando…' : 'Enviar a revisión'}</button>
        </>}
        {onFocusChange && <button type="button" className="gw-wk-icon-btn" aria-pressed={focus} aria-label={focus ? 'Salir del modo enfoque' : 'Modo enfoque: ocultar lista y panel'} title={focus ? 'Salir del modo enfoque' : 'Modo enfoque'} onClick={() => onFocusChange(!focus)}>{focus ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}</button>}
      </div>
    </div>
    {recovery && <div className="gw-opal-recovery" role="status"><strong>Hay una copia pendiente en este dispositivo.</strong><p>{recovery.baseVersion === task.current_version ? 'Puedes recuperarla antes de continuar.' : 'Parte de una versión anterior. Revisa su contenido antes de guardar sobre la versión actual.'}</p><button type="button" onClick={recover}>Recuperar copia</button><button type="button" onClick={() => {clearRecovery(actorId,task.id);setRecovery(null);}}>Descartar copia local</button></div>}
    {error && <p className="gw-wk-alert" role="alert"><AlertCircle size={17} aria-hidden="true" />{error}</p>}
    {staleDraft && <p className="gw-wk-banner" data-tone="warn"><AlertCircle size={17} aria-hidden="true" />Este borrador parte de la versión {saved.base_version}; la última entrega es la versión {task.current_version}. Revisa el contenido y guarda el borrador antes de enviarlo.</p>}
    {!editable && <p className="gw-wk-banner" data-tone={readOnly.tone}><readOnly.Icon size={17} aria-hidden="true" />{readOnly.text}</p>}
    {latestChange && <section className="gw-wk-changes" aria-label="Cambios solicitados">
      <h3><AlertCircle size={16} aria-hidden="true" />Cambios solicitados</h3>
      <p>{latestChange.body}</p>
      <small>{changeAuthor || 'Responsable del área'} · {dateLabel(latestChange.created_at)}</small>
    </section>}
    <div className="gw-wk-body">
      <div className="gw-wk-main">
        {!editable && <VersionFile version={version} permissions={permissions} previewMode={previewMode} />}
        {editable && payload
          ? <React.Suspense fallback={<p role="status" className="gw-wk-loading">Abriendo editor…</p>}><RichDocument key={editorKey} scope={{kind:'document',taskId:task.id,projectId:task.project_id,areaId:task.area_id}} palette={[...new Set((data.references || []).flatMap(reference=>reference.palette || []))]} saveState={{state:saveState,text:saveText}} onSave={() => void save(false)} initialDocument={payload.content_document} initialMarkdown={payload.content_markdown} onChange={change} disabled={working || busy} /></React.Suspense>
          : <article className="gw-wk-page">{version?.content_document ? <StructuredDocument document={version.content_document} /> : version?.content_markdown ? <DocumentContent content={version.content_markdown} /> : <p className="gw-wk-page-empty">Todavía no hay una versión enviada de este trabajo.</p>}</article>}
      </div>
      <aside className="gw-wk-context" aria-label="Contexto del trabajo">
        <section><h3>Tu asignación</h3>{task.description_document ? <StructuredDocument document={task.description_document}/> : <p className="gw-wk-prose">{task.description || (task.created_by === actorId ? `Documento creado por ti para esta ${productionNoun(data.projects?.find(p => p.id === task.project_id))}.` : 'El responsable del área todavía no ha añadido indicaciones.')}</p>}</section><TaskMaterials task={task} data={data} onOpen={row => {setReferenceTarget(row.reference_id);setReferenceOpen(true);}} referenceApi={referenceApi} />
        <section><h3>Siguiente paso</h3><p className="gw-wk-next"><ArrowRight size={15} aria-hidden="true" /><span>{nextStep(task, true)}</span></p></section>
        <button type="button" className="gw-wk-btn gw-wk-btn-block" onClick={() => setReferenceOpen(true)}><PanelLeftOpen size={16} aria-hidden="true" />Abrir referencia al lado</button>
        {editable && payload && <details className="gw-wk-fold"><summary><span>Créditos y archivo de apoyo</span></summary><label>Créditos<textarea value={payload.credits} disabled={working || busy} onChange={event => change({ credits: event.target.value })} /></label><label>Enlace a tu archivo<input type="url" placeholder="https://…" disabled={working || busy} value={payload.asset_url} onChange={event => change({ asset_url: event.target.value })} /></label><p>Si tu trabajo está en un repositorio externo, añade aquí su enlace.</p></details>}
        <WorkOperations task={task} permissions={permissions} command={command} busy={working || busy || dirty} />
        {dirty && <small className="gw-wk-hint">Guarda tu borrador antes de cambiar el estado del trabajo.</small>}
      </aside>
    </div>
    <WorkConversation task={task} data={data} command={command} busy={working || busy} />
  </section></ReferenceSplit>;
}
