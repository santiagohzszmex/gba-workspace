export const FONTS = { 'Inter, system-ui, sans-serif': 'Inter', 'Georgia, serif': 'Georgia', 'Arial, sans-serif': 'Arial', 'Times New Roman, serif': 'Times New Roman' };
export const FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px'];
export const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] };
export function documentText(node) { return node?.type === 'text' ? node.text || '' : node?.type === 'mention' ? `@${node.attrs?.label || 'Integrante'}` : node?.type === 'originalImage' ? node.attrs?.caption || '[Imagen]' : (node?.content || []).map(documentText).join(['doc','tableRow'].includes(node?.type) ? '\n' : ''); }
const codeFence = (text, minimum = 1) => '`'.repeat((text.match(/`+/g) || []).reduce((longest, run) => Math.max(longest, run.length), minimum - 1) + 1);
export function documentMarkdown(node) {
  const type = node?.type;
  let body = (node?.content || []).map(documentMarkdown).join('');
  if (type === 'mention') return `@${String(node.attrs?.label || 'Integrante').replace(/[\\*_\[\]<>#`]/g, '\\$&')}`;
  if (type === 'originalImage') return `\n[Imagen: ${String(node.attrs?.caption || 'Original privado').replace(/[\\*_\[\]<>#`]/g, '\\$&')}]${node.attrs?.credits ? ` · Crédito: ${node.attrs.credits}` : ''}\n\n`;
  if (type === 'table') return (node.content || []).map(row => `| ${(row.content || []).map(cell => documentMarkdown(cell).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')).join(' | ')} |`).join('\n') + '\n\n';
  if (['tableCell','tableHeader','tableRow'].includes(type)) return body;
  if (type === 'text') {
    body = (node.text || '').replace(/[\\*_\[\]<>#`]/g, '\\$&');
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') body = `**${body}**`;
      if (mark.type === 'italic') body = `*${body}*`;
      if (mark.type === 'strike') body = `~~${body}~~`;
      if (mark.type === 'code') { const fence = codeFence(node.text || ''); body = `${fence} ${node.text || ''} ${fence}`; }
      if (mark.type === 'link' && /^https?:\/\/[^\s<>]+$/.test(mark.attrs?.href || '')) body = `[${body}](${mark.attrs.href.replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
    }
    return body;
  }
  if (type === 'paragraph') return `${body}\n\n`;
  if (type === 'heading') return `${'#'.repeat(Math.min(6, Math.max(1, node.attrs?.level || 2)))} ${body}\n\n`;
  if (type === 'hardBreak') return '\n';
  if (type === 'horizontalRule') return '\n---\n\n';
  if (type === 'bulletList' || type === 'orderedList') return (node.content || []).map((item, index) => `${type === 'bulletList' ? '-' : `${index + 1}.`} ${documentMarkdown(item).trimEnd().replace(/\n/g, '\n  ')}\n`).join('') + '\n';
  if (type === 'blockquote') return `> ${body.trimEnd().replace(/\n/g, '\n> ')}\n\n`;
  if (type === 'codeBlock') { body = documentText(node); const fence = codeFence(body, 3); return `${fence}\n${body}\n${fence}\n\n`; }
  return body;
}
export function taskIsMine(task, userId) { return task.responsible_id === userId || task.collaborator_ids?.includes(userId); }
export const EDITABLE_STATES = ['pending', 'assigned', 'in_progress', 'changes_requested'];
export function reviewAction(task, permissions, area) {
  if (task.qa_blocked || task.state === 'blocked') return null;
  if (task.state === 'review' && permissions[`review.approve_${area?.specialty}`]) return { action: 'task.transition', state: 'area_approved', label: ['image','video'].includes(task.kind)?'Aprobar por el área':'Aceptar documento' };
  if (task.state === 'area_approved' && permissions['review.queue_qa']) return { action: 'task.transition', state: 'in_qa', label: 'Pasar a QA' };
  if (task.state === 'in_qa' && permissions['qa.approve'] && !task.qa_blocked) return { action: 'task.transition', state: 'qa_approved', label: 'Aprobar QA' };
  if (task.state === 'qa_approved' && !task.final_approved_by && permissions['publication.approve_final']) return { action: 'publication.approve', label: 'Aprobar publicación final' };
  if (task.state === 'qa_approved' && task.final_approved_by && permissions['publication.execute']) return { action: 'task.transition', state: 'published', label: 'Publicar en VISTA' };
  return null;
}

export function canReviewTask(task, permissions, area) { return Boolean(reviewAction(task, permissions, area) || (task.qa_blocked && permissions['qa.approve']) || (['review', 'in_qa'].includes(task.state) && permissions['review.request_changes'] && (task.state !== 'in_qa' || permissions['qa.approve']))); }

export const hasReviewPermission = p => Object.entries(p).some(([key, value]) => value && (key.startsWith('review.') || ['qa.block_release', 'qa.approve', 'publication.approve_final', 'publication.execute'].includes(key)));

export function editionCapabilities(data) {
  const permissions = [...Object.values(data.areaPermissions || {}), ...Object.values(data.taskPermissions || {})];
  return {
    canAssign: permissions.some(p => p['task.assign']),
    canReview: permissions.some(hasReviewPermission)
  };
}

export function initialSection(data, projectId, actorId) {
  const { canAssign, canReview } = editionCapabilities(data);
  const tasks = data.tasks.filter(task => task.project_id === projectId);
  const approvesContent = [...Object.values(data.areaPermissions || {}), ...Object.values(data.taskPermissions || {})].some(p => Object.entries(p).some(([key, value]) => value && (key.startsWith('review.approve_') || ['qa.approve', 'publication.approve_final'].includes(key))));
  if (canAssign && !approvesContent) return 'assignments';
  if (canReview && tasks.some(task => canReviewTask(task, data.taskPermissions?.[task.id] || {}, data.areas.find(area => area.id === task.area_id)))) return 'reviews';
  if (canAssign) return 'assignments';
  if (canReview) return 'reviews';
  if (tasks.some(task => taskIsMine(task, actorId)) || Object.values(data.areaPermissions || {}).some(p => p['content.create'])) return 'work';
  return 'documents';
}

export function nextStep(task, personal = false) {
  if (task.qa_blocked) return 'QA debe verificar la corrección antes de retomar el trabajo.';
  return {
    pending: 'Falta asignar una persona responsable.', assigned: task.kind==='video'?(personal?'Sube la copia de revisión del video (MP4, hasta 720p) y envíala a revisión.':'La persona asignada sube la copia de revisión del video y la envía a revisión.'):task.kind==='image'?(personal?'Entrega una imagen (PNG) y envíala a revisión.':'La persona asignada entrega una imagen (PNG) y la envía a revisión.'):(personal ? 'Prepara tu documento y envíalo a revisión.' : 'La persona asignada prepara el documento y lo envía a revisión.'),
    in_progress: personal ? 'Continúa tu borrador y envíalo cuando esté listo.' : 'La persona asignada está preparando la entrega.', changes_requested: personal ? 'Corrige la entrega con las indicaciones recibidas y vuelve a enviarla.' : 'La persona asignada debe aplicar las correcciones y enviar otra versión.',
    review: task.kind==='video'?'El área revisa el video: comenta en momentos exactos, aprueba o pide cambios.':task.kind==='image'?'Falta la aprobación del área. Después sigue QA y la aprobación final de Dirección.':'El área debe revisar esta versión y aceptarla o solicitar correcciones.',
    area_approved: task.kind==='video'?'Video aprobado por el área. Después sigue QA y la aprobación final de Dirección.':task.kind==='image'?'Aprobada por el área. Después sigue QA y la aprobación final de Dirección.':'La entrega aceptada está disponible en Documentos. El equipo puede consultarla.',
    in_qa: 'QA revisa archivos, créditos, permisos y exportaciones.',
    qa_approved: task.final_approved_by ? 'La publicación final está autorizada; falta ejecutarla.' : 'Falta la aprobación final de Dirección.',
    published: 'Publicado. Se conserva la versión y su autoría.', archived: 'Archivado para consulta.',
    blocked: 'Resuelve el motivo del bloqueo para retomar el trabajo.'
  }[task.state] || '';
}
