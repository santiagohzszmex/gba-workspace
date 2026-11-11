// Workspace 1.8.0 Labradorita · Subida y reproducción de copias de revisión de video.
// Usa la misma pasarela que las imágenes (rol «video»). Se guarda el plan de subida para reanudar; nunca bytes ni credenciales.
import { supabase } from '../../supabaseClient';
import { createImageUploader } from '../imageUploadClient.mjs';
import { hashFile } from '../images/imageFiles.mjs';

const planKey = (actor, task) => `workspace-video-upload:v1:${actor}:${task}`;
export function readVideoPlan(actor, task) {
  try { const plan = JSON.parse(localStorage.getItem(planKey(actor, task))); return plan?.owner_id === actor && plan.deliverable_id === task ? plan : null; } catch { return null; }
}

export async function videoStorageApi(action, task, value, { actorId, gateway }) {
  if (action === 'plan.get') return readVideoPlan(actorId, task.id);
  const authorization = async () => { const { data, error } = await supabase.auth.getSession(); if (error || !data.session?.access_token) throw Error('Inicia sesión para acceder a los archivos.'); return `Bearer ${data.session.access_token}`; };
  const uploader = createImageUploader({
    gateway, authorization,
    hashFile: file => hashFile(file, { signal: value.signal, onProgress: p => value.onProgress?.({ ...p, state: 'hashing' }) }),
    persist: async plan => { localStorage.setItem(planKey(actorId, plan.deliverable_id), JSON.stringify(plan)); },
    onProgress: value.onProgress
  });
  if (action === 'link') return uploader.downloadLink(value.assetId, 'stream');
  const old = readVideoPlan(actorId, task.id);
  if (action === 'cancel') { const result = old && !old.completed ? await uploader.cancel(old, { ownerId: actorId }) : { cancelled: true }; localStorage.removeItem(planKey(actorId, task.id)); return result; }
  if (action === 'upload') {
    const reusable = old && !old.completed && !old.cancelled && old.size_bytes === value.file.size && old.file_name === value.file.name && (!old.expires_at || new Date(old.expires_at).getTime() > Date.now());
    const plan = reusable ? old : await uploader.prepare(value.file, { ownerId: actorId, deliverableId: task.id, role: 'video', format: 'mp4' });
    const result = await uploader.upload(plan, value.file, { ownerId: actorId, signal: value.signal });
    return { asset: { id: result.asset_id, deliverable_id: task.id, file_name: result.file_name, size_bytes: result.size_bytes, sha256: result.sha256, width: result.width, height: result.height, duration_ms: result.duration_ms, owner_id: actorId } };
  }
  throw Error('Operación de video no disponible.');
}
