import React, { useState } from 'react';
import { FileText, Film } from 'lucide-react';
import './video.css';

// Asignaciones de una producción de video: la entrega es un documento (guion, textos) o un video.
export default function VideoKindForm({ task, project, video, api, busy, editable }) {
  const [kind, setKind] = useState(task.kind === 'video' ? 'video' : 'document'), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  if (project?.kind !== 'video' || task.kind === 'image' || !video?.enabled) return null;
  const locked = task.current_version > 0, changed = kind !== (task.kind === 'video' ? 'video' : 'document');
  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { await api('kind.set', task, { kind }, task.revision); } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  return <section className="gw-wk-card gw-video-kind"><h3>Qué se entrega</h3>
    <form onSubmit={save}><fieldset disabled={!editable || busy || saving || locked}><legend className="gw-sr-only">Tipo de entrega</legend>
      <div className="gw-video-kind-options" role="radiogroup" aria-label="Tipo de entrega">
        <label data-checked={kind === 'document' || undefined}><input type="radio" name="video-kind" checked={kind === 'document'} onChange={() => setKind('document')} /><FileText size={18} aria-hidden="true" /><span><strong>Documento</strong><small>Guion, textos o indicaciones, escritos en Workspace.</small></span></label>
        <label data-checked={kind === 'video' || undefined}><input type="radio" name="video-kind" checked={kind === 'video'} onChange={() => setKind('video')} disabled={!video.uploads_enabled && task.kind !== 'video'} /><Film size={18} aria-hidden="true" /><span><strong>Video</strong><small>Copia de revisión en MP4, hasta 720p. Se comenta sobre el video.</small></span></label>
      </div>
      {locked ? <p className="gw-image-hint">El tipo se fija con la primera versión enviada.</p> : editable && changed && <button className="gw-wk-btn" disabled={saving || busy}>{saving ? 'Guardando…' : 'Guardar tipo de entrega'}</button>}
    </fieldset>{error && <p role="alert" className="gw-image-error">{error}</p>}</form>
  </section>;
}
