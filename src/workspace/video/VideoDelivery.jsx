import React, { useEffect, useRef, useState } from 'react';
import { Download, Film, Pause, Upload } from 'lucide-react';
import { EDITABLE_STATES } from '../documentModel';
import VideoReview from './VideoReview';
import { VideoPlayer } from './VideoPlayer';
import { BLENDER_SCRIPT, BLENDER_SCRIPT_NAME, DEFAULT_POLICY, fileSize, formatTime, uploadMessage, videoProblem } from './videoModel.mjs';
import './video.css';

// Lee tamaño y duración en el propio equipo antes de subir, para avisar al momento.
export function probeVideo(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file), element = document.createElement('video');
    const done = value => { element.removeAttribute('src'); element.load(); resolve({ ...value, url }); };
    element.preload = 'metadata'; element.muted = true;
    element.onloadedmetadata = () => done({ width: element.videoWidth, height: element.videoHeight, durationMs: Math.round(element.duration * 1000), playable: true });
    element.onerror = () => done({ width: 0, height: 0, durationMs: 0, playable: false });
    element.src = url;
  });
}

export function downloadBlenderScript() {
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([BLENDER_SCRIPT], { type: 'text/x-python' }));
  link.href = url; link.download = BLENDER_SCRIPT_NAME; link.rel = 'noreferrer'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function VideoRequirements({ policy }) {
  const p = { ...DEFAULT_POLICY, ...policy };
  return <div className="gw-video-requirements">
    <p><strong>Copia de revisión</strong> · MP4 (H.264), hasta 720p, {Math.round(p.max_seconds / 60)} minutos y {fileSize(p.max_bytes)}. Tu archivo final y tus proyectos se quedan en tu computadora.</p>
    <button type="button" className="gw-video-link" onClick={downloadBlenderScript}><Download size={14} aria-hidden="true" />Descargar ajuste de Blender</button>
  </div>;
}

const STATES = { checking: 'Revisando el video…', hashing: 'Preparando la subida…', receiving: 'Subiendo…', validating: 'Comprobando el video en el servidor…', ready: 'Video guardado.' };

export default function VideoDelivery({ task, data, actorId, api, command, busy, onDirtyChange, readOnly = false }) {
  const video = data.video || {}, permissions = data.taskPermissions?.[task.id] || {};
  const editable = !readOnly && video.uploads_enabled && permissions['content.edit_assigned'] && EDITABLE_STATES.includes(task.state);
  const pending = Object.values(video.assets || {}).filter(a => a.deliverable_id === task.id && a.owner_id === actorId && !a.purged && !Object.values(video.versions || {}).some(v => v.asset_id === a.id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
  const [asset, setAsset] = useState(pending), [local, setLocal] = useState(null), [problem, setProblem] = useState(null), [progress, setProgress] = useState(null);
  const [working, setWorking] = useState(false), [summary, setSummary] = useState(''), [note, setNote] = useState(''), [error, setError] = useState(''), [saved, setSaved] = useState(''), [dragging, setDragging] = useState(false);
  const controller = useRef(null), input = useRef(null), alive = useRef(true), lastFile = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (!asset && pending) setAsset(pending); }, [pending?.id]);
  useEffect(() => () => { if (local?.url) URL.revokeObjectURL(local.url); }, [local?.url]);
  const uploading = Boolean(progress && !['ready', 'failed', 'paused'].includes(progress.state));
  const dirty = uploading || Boolean(asset && !Object.values(video.versions || {}).some(v => v.asset_id === asset.id)) || Boolean(note.trim() || summary.trim());
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);
  useEffect(() => () => onDirtyChange?.(false), []);

  async function choose(file) {
    if (!file || !editable || uploading) return;
    setError(''); setSaved(''); setAsset(null); setProblem(null); lastFile.current = file;
    setProgress({ state: 'checking', received: 0, total: file.size });
    const meta = await probeVideo(file);
    if (local?.url) URL.revokeObjectURL(local.url);
    setLocal({ ...meta, name: file.name, size: file.size });
    const reason = videoProblem({ name: file.name, size: file.size, width: meta.width, height: meta.height, durationMs: meta.durationMs }, video.policy);
    if (reason) { setProblem({ text: reason, blocking: true }); setProgress(null); return; }
    setProblem(meta.playable ? null : { text: 'Este navegador no puede reproducir el video. Puedes subirlo, pero revisa que esté exportado en H.264 con audio AAC.', blocking: false });
    await send(file);
  }
  async function send(file = lastFile.current) {
    if (!file) return;
    controller.current = new AbortController(); setWorking(true); setError('');
    try {
      const result = await api('upload', task, { file, signal: controller.current.signal, onProgress: p => { if (alive.current) setProgress(p); } });
      if (alive.current) { setAsset(result.asset); setProgress({ state: 'ready', received: file.size, total: file.size }); }
    } catch (e) {
      if (alive.current) { setError(uploadMessage(e)); setProgress(p => p ? { ...p, state: e.name === 'AbortError' ? 'paused' : 'failed' } : p); }
    } finally { if (alive.current) setWorking(false); }
  }
  async function cancel() {
    controller.current?.abort();
    try { await api('cancel', task, {}); } catch (e) { setError(uploadMessage(e)); }
    setProgress(null); setAsset(null); setLocal(null); lastFile.current = null;
  }
  async function submit() {
    if (!asset || working || busy) return;
    setWorking(true); setError('');
    try {
      await api('version.submit', task, { asset_id: asset.id, base_version: task.current_version, change_summary: summary.trim() || undefined, note: note.trim() });
      setSaved('Video enviado a revisión.'); setAsset(null); setLocal(null); setSummary(''); setNote(''); setProgress(null); onDirtyChange?.(false);
    } catch (e) { setError(e.message); } finally { setWorking(false); }
  }

  if (!video.enabled) return <p className="gw-work-notice">Las entregas de video todavía no están habilitadas en este entorno.</p>;
  const area = data.areas?.find(a => a.id === task.area_id)?.name, project = data.projects?.find(p => p.id === task.project_id)?.title;
  const history = task.current_version > 0 ? <VideoReview task={task} data={data} actorId={actorId} api={api} command={command} busy={busy} readOnly={readOnly} /> : null;
  if (!editable) return <section className="gw-video-delivery" aria-label="Video"><div className="gw-video-head"><span className="gw-wk-eyebrow">{area} · Video</span><h2>{task.title}</h2></div>
    {!video.uploads_enabled && !readOnly && EDITABLE_STATES.includes(task.state) && <p className="gw-work-notice" role="status">Las nuevas subidas de video están desactivadas. Lo enviado sigue disponible.</p>}
    {history || <p className="gw-work-notice">Todavía no hay una versión de video enviada.</p>}</section>;

  const ready = Boolean(asset) && !uploading && !problem?.blocking;
  return <section className="gw-video-delivery" aria-label="Entregar video">
    <div className="gw-video-head"><span className="gw-wk-eyebrow">{area} · Video</span><h2>{task.title}</h2><p>{task.current_version ? `Nueva versión (v${task.current_version + 1})` : 'Primera versión'} · {project}</p></div>
    <VideoRequirements policy={video.policy} />
    <div className="gw-video-drop" data-dragging={dragging || undefined}
      onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length !== 1) { setError('Elige un solo video.'); return; } void choose(e.dataTransfer.files[0]); }}>
      <input ref={input} type="file" hidden accept="video/mp4,.mp4,.m4v" aria-label="Elegir video MP4" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
      {local?.url && local.playable && !problem?.blocking ? <VideoPlayer api={api} asset={{ id: 'local', local_url: local.url, width: local.width, height: local.height, duration_ms: local.durationMs }} />
        : asset ? <div className="gw-video-pending"><Film size={22} aria-hidden="true" /><strong>{asset.file_name}</strong><small>Subido y listo para enviar.</small></div>
        : <div className="gw-video-pending"><Upload size={22} aria-hidden="true" /><p>Arrastra tu video aquí o elige el archivo.</p></div>}
      <div className="gw-video-file-row">
        {(local || asset) && <span><strong>{local?.name || asset?.file_name}</strong> · {fileSize(local?.size || asset?.size_bytes)}{(local?.width || asset?.width) ? ` · ${local?.width || asset.width} × ${local?.height || asset.height}` : ''}{(local?.durationMs || asset?.duration_ms) ? ` · ${formatTime(local?.durationMs || asset.duration_ms)}` : ''}</span>}
        <button type="button" disabled={uploading || busy} onClick={() => input.current?.click()}>{local || asset ? 'Elegir otro video' : 'Elegir video'}</button>
      </div>
    </div>
    {problem && <p className={problem.blocking ? 'gw-image-error' : 'gw-image-hint'} role="alert">{problem.text}</p>}
    {progress && progress.state !== 'checking' && <div className="gw-image-progress" role="status"><span>{progress.state === 'paused' ? 'Subida pausada.' : progress.state === 'failed' ? 'La subida se detuvo.' : STATES[progress.state] || 'Subiendo…'}</span>
      <progress max={progress.total || 1} value={progress.received || 0} /><small>{fileSize(progress.received)} de {fileSize(progress.total)}{progress.totalParts ? ` · parte ${progress.parts} de ${progress.totalParts}` : ''}</small></div>}
    <div className="gw-image-upload-actions">
      {uploading && <button type="button" onClick={() => controller.current?.abort()}><Pause size={14} aria-hidden="true" />Pausar</button>}
      {!uploading && lastFile.current && progress && ['paused', 'failed'].includes(progress.state) && <button type="button" onClick={() => void send()}>Continuar subida</button>}
      {(uploading || (progress && ['paused', 'failed'].includes(progress.state))) && <button type="button" onClick={() => void cancel()}>Cancelar subida</button>}
    </div>
    <div className="gw-video-fields">
      <label>Qué cambió <small>Opcional</small><input value={summary} maxLength={200} onChange={e => setSummary(e.target.value)} placeholder={task.current_version ? 'Por ejemplo: corregí la entrada de la mascota' : 'Primer pase de animación'} disabled={busy || working} /></label>
      <label>Nota para quien revisa <small>Opcional</small><textarea value={note} maxLength={4000} onChange={e => setNote(e.target.value)} disabled={busy || working} /></label>
    </div>
    <footer className="gw-image-delivery-footer"><div><p role="status">{saved || (uploading ? 'Espera a que termine la subida.' : ready ? 'El video está listo para enviar a revisión.' : 'Sube el video para poder enviarlo.')}</p>{error && <p role="alert" className="gw-image-error">{error}</p>}</div>
      <div><button type="button" className="gw-primary" disabled={!ready || busy || working} onClick={() => void submit()}>Enviar a revisión</button></div></footer>
    {history && <div className="gw-video-history"><h3>Versiones anteriores y comentarios</h3>{history}</div>}
  </section>;
}
