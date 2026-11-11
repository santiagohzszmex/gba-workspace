// Demostración local de video (sólo desarrollo, ?workspace-preview=1&video-preview=1). Nunca toca datos reales.
import { DEMO_ACTORS, demoPermissions } from '../workflowDemo';
import { taskIsMine } from '../documentModel';
import { probeVideo } from './VideoDelivery';

const AREAS = [['script', 'Guion'], ['storyboard', 'Storyboard y animatic'], ['art', 'Arte y personajes'], ['animation_3d', 'Animación 3D'], ['animation_2d', 'Animación 2D'], ['editing', 'Edición y montaje'], ['social', 'Publicación en redes']];
const PROJECT = 'mascota-demo', area = s => `mascota-${s}-demo`;
const local = new Map();

export function initializeVideoDemo(state) {
  if (state.video) return;
  Object.assign(DEMO_ACTORS, {
    animator: { id: 'demo-animator', name: 'Animación 3D', role: 'gimg_contributor', area: area('animation_3d'), projects: [PROJECT] },
    animLead: { id: 'demo-anim-lead', name: 'Responsable de Animación 3D', role: 'gimg_area_lead', area: area('animation_3d'), projects: [PROJECT] },
    social: { id: 'demo-social', name: 'Publicación en redes', role: 'gimg_contributor', area: area('social'), projects: [PROJECT] }
  });
  if (!DEMO_ACTORS.direction.projects.includes(PROJECT)) DEMO_ACTORS.direction.projects.push(PROJECT);
  for (const key of ['animator', 'animLead', 'social']) state.members.push({ user_id: DEMO_ACTORS[key].id, display_name: DEMO_ACTORS[key].name, handle: DEMO_ACTORS[key].id, membership_status: 'active' });
  state.projects.unshift({ id: PROJECT, unit_id: 'gimg-demo', title: 'Corto de la mascota', kind: 'video', brief: 'Primer corto animado de la mascota de GIMG.', status: 'active', revision: 1 });
  state.areas.push(...AREAS.map(([specialty, name]) => ({ id: area(specialty), project_id: PROJECT, name, specialty })));
  const base = { project_id: PROJECT, unit_id: 'gimg-demo', description: '', collaborator_ids: [], priority: 'normal', revision: 1, round: 0, extra_rounds: 0, due_at: new Date(Date.now() + 5 * 86400000).toISOString() };
  state.tasks.push(
    { ...base, id: 'mascota-anim-demo', area_id: area('animation_3d'), title: 'Entrada de la mascota', kind: 'video', responsible_id: 'demo-animator', state: 'review', current_version: 2, round: 1, extra_rounds: 1 },
    { ...base, id: 'mascota-2d-demo', area_id: area('animation_2d'), title: 'Créditos animados', kind: 'video', responsible_id: 'demo-animator', state: 'assigned', current_version: 0 },
    { ...base, id: 'mascota-social-demo', area_id: area('social'), title: 'Publicar el corto', kind: 'document', responsible_id: 'demo-social', state: 'assigned', current_version: 0 }
  );
  const at = days => new Date(Date.now() - days * 86400000).toISOString();
  state.video = {
    policy: { max_bytes: 314572800, max_seconds: 600, max_long_side: 1280, max_short_side: 720, part_bytes: 8388608, purge_hours: 48 },
    assets: {
      'mascota-asset-1': { id: 'mascota-asset-1', deliverable_id: 'mascota-anim-demo', file_name: 'entrada_v1.mp4', size_bytes: 1800000, width: 1280, height: 720, duration_ms: 12000, audio_codec: 'mp4a', owner_id: 'demo-animator', created_at: at(3), url: '/__video/sample-v1.mp4' },
      'mascota-asset-2': { id: 'mascota-asset-2', deliverable_id: 'mascota-anim-demo', file_name: 'entrada_v2.mp4', size_bytes: 1900000, width: 1280, height: 720, duration_ms: 12000, audio_codec: 'mp4a', owner_id: 'demo-animator', created_at: at(1), url: '/__video/sample-v2.mp4' }
    },
    versions: {
      'mascota-version-1': { version_id: 'mascota-version-1', deliverable_id: 'mascota-anim-demo', version_number: 1, asset_id: 'mascota-asset-1', duration_ms: 12000, width: 1280, height: 720, note: 'Primer pase: entrada y saludo.', author_id: 'demo-animator', change_summary: 'Primer pase de animación', credits: 'Animación 3D', created_at: at(3) },
      'mascota-version-2': { version_id: 'mascota-version-2', deliverable_id: 'mascota-anim-demo', version_number: 2, asset_id: 'mascota-asset-2', duration_ms: 12000, width: 1280, height: 720, note: 'Corregí la velocidad de la entrada.', author_id: 'demo-animator', change_summary: 'Entrada más lenta', credits: 'Animación 3D', created_at: at(1) }
    },
    notes: [
      { id: 'mascota-note-1', version_id: 'mascota-version-1', author_id: 'demo-anim-lead', time_ms: 2400, body: 'La mascota entra demasiado rápido; dale medio segundo más.', drawing: [{ color: '#e5484d', width: 4, points: [[0.2, 0.62], [0.35, 0.55], [0.5, 0.52], [0.62, 0.56]] }], created_at: at(2.5) },
      { id: 'mascota-note-2', version_id: 'mascota-version-2', author_id: 'demo-anim-lead', time_ms: 8100, body: 'El saludo funciona. Revisa la sombra en el piso.', drawing: null, created_at: at(0.5) }
    ],
    replies: [{ id: 'mascota-reply-1', note_id: 'mascota-note-1', author_id: 'demo-animator', body: 'Listo, lo ajusté en la v2.', created_at: at(1.2) }],
    resolutions: [],
    publications: []
  };
  state.versions.push(...Object.values(state.video.versions).map(v => ({ id: v.version_id, deliverable_id: v.deliverable_id, version_number: v.version_number, kind: 'video', change_summary: v.change_summary, credits: v.credits, author_id: v.author_id, created_at: v.created_at })));
}

const reviewerOf = (actor, task, areas) => { const p = demoPermissions(actor, task.project_id, task.area_id, task), spec = areas.find(a => a.id === task.area_id)?.specialty; return Boolean(p['review.request_changes'] || p['qa.approve'] || p['publication.approve_final'] || p[`review.approve_${spec}`]); };
const canPublish = (actor, task, state) => demoPermissions(actor, task.project_id, task.area_id, task)['publication.approve_final'] || state.areas.some(a => a.project_id === task.project_id && a.specialty === 'social' && (demoPermissions(actor, task.project_id, a.id)['review.approve_social'] || state.tasks.some(t => t.area_id === a.id && taskIsMine(t, actor.id))));

export function videoDemoBundle(state, actor, projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!state.video || project?.kind !== 'video') return { enabled: false };
  const v = state.video, tasks = state.tasks.filter(t => t.project_id === projectId && t.kind === 'video' && demoPermissions(actor, projectId, t.area_id, t)['content.read']);
  const ids = new Set(tasks.map(t => t.id)), versions = Object.fromEntries(Object.entries(v.versions).filter(([, x]) => ids.has(x.deliverable_id)));
  const used = new Set(Object.values(versions).map(x => x.asset_id)), noteIds = new Set(v.notes.filter(n => versions[n.version_id]).map(n => n.id));
  const readable = state.tasks.filter(t => t.project_id === projectId && demoPermissions(actor, projectId, t.area_id, t)['task.read']);
  const publisher = readable.filter(t => canPublish(actor, t, state)).sort((a, b) => Number(taskIsMine(b, actor.id)) - Number(taskIsMine(a, actor.id)))[0];
  return {
    enabled: true, uploads_enabled: true, policy: v.policy,
    assets: Object.fromEntries(Object.entries(v.assets).filter(([id, a]) => ids.has(a.deliverable_id) && (used.has(id) || a.owner_id === actor.id))),
    versions, notes: v.notes.filter(n => noteIds.has(n.id)), replies: v.replies.filter(r => noteIds.has(r.note_id)), resolutions: v.resolutions.filter(r => noteIds.has(r.note_id)),
    publications: v.publications.filter(p => p.project_id === projectId && !p.removed_at), publish_task_id: publisher?.id || null,
    has_approved_video: state.tasks.some(t => t.project_id === projectId && t.kind === 'video' && t.current_version > 0 && ['area_approved', 'in_qa', 'qa_approved', 'published'].includes(t.state)),
    reviewer: Object.fromEntries(tasks.map(t => [t.id, reviewerOf(actor, t, state.areas)]))
  };
}

export async function videoDemoApi(state, actor, action, task, value = {}, revision = null) {
  const v = state.video, now = new Date().toISOString(), id = prefix => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  if (action === 'link') { const a = v.assets[value.assetId]; return a?.purged ? { available: false, message: 'La copia de revisión se borró después de publicar el video.' } : { available: true, url: local.get(a?.id) || a?.url }; }
  if (action === 'plan.get') return null;
  if (action === 'cancel') return { cancelled: true };
  if (action === 'upload') {
    const meta = await probeVideo(value.file), asset = { id: id('demo-video'), deliverable_id: task.id, file_name: value.file.name, size_bytes: value.file.size, width: meta.width, height: meta.height, duration_ms: meta.durationMs, owner_id: actor.id, created_at: now };
    for (let p = 1; p <= 4; p++) { if (value.signal?.aborted) throw new DOMException('Pausado', 'AbortError'); value.onProgress?.({ state: 'receiving', received: value.file.size * p / 4, total: value.file.size, parts: p, totalParts: 4 }); await new Promise(r => setTimeout(r, 250)); }
    local.set(asset.id, meta.url); v.assets[asset.id] = asset; return { asset };
  }
  const t = state.tasks.find(x => x.id === task.id);
  if (action === 'kind.set') { t.kind = value.kind; t.revision++; return t; }
  if (action === 'version.submit') {
    const a = v.assets[value.asset_id], number = t.current_version + 1, version = { version_id: id('demo-video-version'), deliverable_id: t.id, version_number: number, asset_id: a.id, duration_ms: a.duration_ms, width: a.width, height: a.height, note: value.note || '', author_id: actor.id, change_summary: value.change_summary || 'Nueva versión de video', credits: '', created_at: now };
    v.versions[version.version_id] = version; state.versions.push({ id: version.version_id, deliverable_id: t.id, version_number: number, kind: 'video', change_summary: version.change_summary, author_id: actor.id, created_at: now });
    Object.assign(t, { current_version: number, state: 'review', revision: t.revision + 1 }); return version;
  }
  if (action === 'note.add') { const note = { id: id('demo-video-note'), version_id: value.version_id, author_id: actor.id, time_ms: value.time_ms, body: value.body, drawing: value.drawing || null, created_at: now }; v.notes.push(note); return note; }
  if (action === 'note.reply') { const reply = { id: id('demo-video-reply'), note_id: value.note_id, author_id: actor.id, body: value.body, created_at: now }; v.replies.push(reply); return reply; }
  if (action === 'note.resolve' || action === 'note.verify') { const note = v.notes.find(n => n.id === value.note_id), row = { id: id('demo-video-resolution'), note_id: note.id, verified_version_id: value.verified_version_id || note.version_id, resolved: value.resolved !== false, actor_id: actor.id, created_at: now }; v.resolutions.push(row); return row; }
  if (action === 'publication.add') {
    const row = { id: id('demo-video-publication'), project_id: t.project_id, deliverable_id: t.id, network: value.network, url: value.url, published_at: value.published_at || now, author_id: actor.id, created_at: now }; v.publications.unshift(row);
    const current = new Set(state.tasks.filter(x => x.project_id === t.project_id && x.kind === 'video').map(x => Object.values(v.versions).find(y => y.deliverable_id === x.id && y.version_number === x.current_version)?.asset_id));
    for (const a of Object.values(v.assets)) if (state.tasks.find(x => x.id === a.deliverable_id)?.project_id === t.project_id && !current.has(a.id) && !a.purge_due_at) a.purge_due_at = new Date(Date.now() + v.policy.purge_hours * 3600000).toISOString();
    return row;
  }
  if (action === 'publication.remove') { const row = v.publications.find(p => p.id === value.publication_id); row.removed_at = now; return row; }
  throw Error('Acción de video no disponible en la demostración.');
}
