import React, { useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { dateLabel } from '../gimgModel';
import { VIDEO_NETWORKS, networkFromUrl, validPublicationUrl } from './videoModel.mjs';
import './video.css';

const person = (data, id) => data.members?.find(m => m.user_id === id)?.display_name || 'Integrante';

export function PublicationList({ data, actorId, onRemove, busy }) {
  const items = data.video?.publications || [];
  if (!items.length) return null;
  return <section className="gw-video-publications-list" aria-label="Publicaciones registradas"><h4>Publicado en</h4><ul>{items.map(item => <li key={item.id}>
    <a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />{VIDEO_NETWORKS[item.network] || item.network}</a>
    <small>{dateLabel(item.published_at)} · {person(data, item.author_id)}</small>
    {onRemove && item.author_id === actorId && <button type="button" className="gw-video-icon" aria-label={`Quitar registro de ${VIDEO_NETWORKS[item.network] || item.network}`} disabled={busy} onClick={() => onRemove(item)}><Trash2 size={14} aria-hidden="true" /></button>}
  </li>)}</ul></section>;
}

const localInput = date => { const d = new Date(date); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

// Etapa «Publicación en redes»: dónde y cuándo se publicó. Workspace no publica por su cuenta.
export default function VideoPublications({ project, data, actorId, api, busy }) {
  const video = data.video || {}, taskId = video.publish_task_id;
  const [url, setUrl] = useState(''), [network, setNetwork] = useState(''), [when, setWhen] = useState(() => localInput(Date.now())), [error, setError] = useState(''), [working, setWorking] = useState(false), [saved, setSaved] = useState('');
  if (project?.kind !== 'video' || !video.enabled) return null;
  const approved = Boolean(video.has_approved_video);
  const task = (data.tasks || []).find(t => t.id === taskId);
  const days = Math.round((video.policy?.purge_hours || 48) / 24);
  async function run(action, payload) {
    setWorking(true); setError(''); setSaved('');
    try { await api(action, task, payload, null); return true; } catch (e) { setError(e.message); return false; } finally { setWorking(false); }
  }
  async function add(event) {
    event.preventDefault();
    if (!validPublicationUrl(url)) { setError('Pega el enlace completo de la publicación (empieza con https://).'); return; }
    if (await run('publication.add', { network: network || networkFromUrl(url) || 'other', url: url.trim(), published_at: new Date(when).toISOString() })) { setUrl(''); setNetwork(''); setSaved('Publicación registrada.'); }
  }
  return <section className="gw-wk-card gw-video-publications" aria-labelledby="gw-video-publications-title">
    <h3 id="gw-video-publications-title">Dónde se publicó</h3>
    <p className="gw-image-hint">Registra cada publicación con su enlace. Workspace no publica por su cuenta. Las copias de revisión viejas se borran {days} día{days === 1 ? '' : 's'} después del primer registro; los comentarios se conservan.</p>
    <PublicationList data={data} actorId={actorId} busy={busy || working} onRemove={task ? item => void run('publication.remove', { publication_id: item.id }) : null} />
    {task && (approved ? <form className="gw-video-publication-form" onSubmit={add}>
      <label>Enlace<input type="url" inputMode="url" value={url} placeholder="https://www.tiktok.com/@gimg/video/…" onChange={e => { setUrl(e.target.value); setSaved(''); }} disabled={busy || working} required /></label>
      <label>Red<select value={network || networkFromUrl(url) || ''} onChange={e => setNetwork(e.target.value)} disabled={busy || working}><option value="" disabled>Elige la red</option>{Object.entries(VIDEO_NETWORKS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Fecha y hora<input type="datetime-local" value={when} max={localInput(Date.now() + 86400000)} onChange={e => setWhen(e.target.value)} disabled={busy || working} required /></label>
      <button type="submit" className="gw-primary" disabled={busy || working || !url.trim()}>Registrar publicación</button>
    </form> : <p className="gw-image-hint">Podrás registrar la publicación cuando un video de esta producción esté aprobado.</p>)}
    {saved && <p role="status">{saved}</p>}
    {error && <p role="alert" className="gw-image-error">{error}</p>}
  </section>;
}
