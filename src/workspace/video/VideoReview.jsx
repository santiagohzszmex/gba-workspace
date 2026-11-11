import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brush, Columns2, MessageSquarePlus, Undo2, X } from 'lucide-react';
import { taskIsMine } from '../documentModel';
import { dateLabel } from '../gimgModel';
import { VideoPlayer } from './VideoPlayer';
import { DRAW_COLORS, fileSize, formatTime, noteStatus, purgeLabel, videoNotes } from './videoModel.mjs';
import { PublicationList } from './VideoPublications';
import './video.css';

const person = (data, id) => data.members?.find(m => m.user_id === id)?.display_name || 'Integrante';

// Revisión de video: reproductor, comentarios en un momento exacto, dibujo sobre el cuadro y comparación de versiones.
export default function VideoReview({ task, data, actorId, api, command, busy, readOnly = false, initialVersionId, onVersionChange }) {
  const video = data.video || {}, permissions = data.taskPermissions?.[task.id] || {};
  const versions = useMemo(() => Object.values(video.versions || {}).filter(v => v.deliverable_id === task.id).map(v => ({ ...v, id: v.version_id })).sort((a, b) => b.version_number - a.version_number), [video.versions, task.id]);
  const [versionId, setVersionId] = useState(initialVersionId || versions[0]?.id), [compareId, setCompareId] = useState(''), [tab, setTab] = useState('notes');
  const [selectedId, setSelectedId] = useState(''), [composing, setComposing] = useState(null), [body, setBody] = useState(''), [reply, setReply] = useState('');
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0][0]), [error, setError] = useState(''), [working, setWorking] = useState(false), [reason, setReason] = useState('');
  const player = useRef(null), now = useRef(0), [clock, setClock] = useState({ ms: 0, playing: false });
  useEffect(() => { setVersionId(initialVersionId || versions[0]?.id); setSelectedId(''); setComposing(null); setCompareId(''); }, [task.id, task.current_version, initialVersionId]);
  const version = versions.find(v => v.id === versionId) || versions[0];
  useEffect(() => { onVersionChange?.(version?.version_number ?? null); }, [version?.id, onVersionChange]);
  const asset = video.assets?.[version?.asset_id], compare = versions.find(v => v.id === compareId), compareAsset = compare && video.assets?.[compare.asset_id];
  const notes = videoNotes(video, versions, version), selected = notes.find(n => n.id === selectedId);
  const reviewer = Boolean(video.reviewer?.[task.id]);
  const open = !readOnly && ['review', 'in_qa', 'changes_requested', 'in_progress'].includes(task.state), current = version?.version_number === task.current_version;
  const canNote = open && current && reviewer && permissions['content.comment'] !== false;
  const canReply = open && (reviewer || taskIsMine(task, actorId));
  const changesAllowed = !readOnly && current && ['review', 'in_qa'].includes(task.state) && permissions['review.request_changes'] && (task.state !== 'in_qa' || permissions['qa.approve']);
  const openNotes = notes.filter(n => !n.resolved);

  async function action(name, payload) {
    setWorking(true); setError('');
    try { return await api(name, task, payload, null); } catch (e) { setError(e.message); return null; } finally { setWorking(false); }
  }
  function pick(note) {
    setSelectedId(note.id); setComposing(null); setReply('');
    if (note.version_number === version.version_number || !note.previous) player.current?.seek(note.time_ms);
    else player.current?.seek(Math.min(note.time_ms, version.duration_ms));
  }
  function startNote(draw = false) { player.current?.pause(); setSelectedId(''); setComposing({ time_ms: Math.round(player.current?.time() ?? now.current), drawing: draw ? [] : null }); }
  async function publish(event) {
    event.preventDefault(); if (!body.trim() || !composing) return;
    const result = await action('note.add', { version_id: version.id, time_ms: Math.min(composing.time_ms, version.duration_ms), body: body.trim(), drawing: composing.drawing?.length ? composing.drawing : null });
    if (result) { setComposing(null); setBody(''); setSelectedId(result.id); }
  }

  if (!video.enabled) return <p className="gw-work-notice">Las entregas de video todavía no están habilitadas.</p>;
  if (!version) return <p className="gw-work-notice">Todavía no hay una versión de video enviada. La persona asignada sube la copia de revisión desde Mi trabajo.</p>;
  // El dibujo de un comentario se ve sólo con el video detenido en su momento.
  const drawing = composing?.drawing ?? (selected?.drawing && !clock.playing && Math.abs(clock.ms - selected.time_ms) < 120 ? selected.drawing : null);
  const replies = (video.replies || []).filter(r => r.note_id === selected?.id);

  return <section className="gw-video-review" aria-label="Revisión de video">
    <div className="gw-video-toolbar">
      <label>Versión<select value={version.id} onChange={e => { setVersionId(e.target.value); setSelectedId(''); setComposing(null); if (e.target.value === compareId) setCompareId(''); }}>
        {versions.map(v => <option key={v.id} value={v.id}>v{v.version_number}{v.version_number === task.current_version ? ' · Actual' : ''}</option>)}</select></label>
      {versions.length > 1 && <label className="gw-video-compare-pick"><Columns2 size={15} aria-hidden="true" />Comparar con<select value={compareId} onChange={e => setCompareId(e.target.value)}>
        <option value="">Sin comparar</option>{versions.filter(v => v.id !== version.id).map(v => <option key={v.id} value={v.id}>v{v.version_number}</option>)}</select></label>}
      <span>{person(data, version.author_id)} · {dateLabel(version.created_at)}</span>
    </div>
    {!current && <p className="gw-image-hint">Estás viendo una versión anterior. Cambia a la actual para comentar o aprobar.</p>}
    {asset && purgeLabel(asset) && <p className="gw-image-hint" role="status">{purgeLabel(asset)}</p>}
    <div className="gw-video-review-layout" data-compare={compareAsset ? true : undefined}>
      <div className="gw-video-stage">
        <VideoPlayer playerRef={player} api={api} asset={asset} label={`v${version.version_number}`} compareAsset={compareAsset} compareLabel={compare && `v${compare.version_number}`}
          markers={notes.filter(n => n.version_number === version.version_number || n.time_ms <= version.duration_ms)} selectedId={selectedId} onMarker={pick} onTime={ms => { now.current = ms; setClock(c => Math.abs(c.ms - ms) < 1 ? c : { ...c, ms }); }} onPlaying={playing => setClock(c => ({ ...c, playing }))}
          drawing={drawing} editableDrawing={Boolean(composing?.drawing)} drawColor={drawColor} onDrawingChange={strokes => setComposing(c => ({ ...c, drawing: strokes }))} />
        {canNote && !composing && <div className="gw-video-note-start">
          <button type="button" className="gw-primary" disabled={busy || working} onClick={() => startNote(false)}><MessageSquarePlus size={15} aria-hidden="true" />Comentar en este momento</button>
          <button type="button" disabled={busy || working} onClick={() => startNote(true)}><Brush size={15} aria-hidden="true" />Dibujar sobre el cuadro</button></div>}
        {composing && <form className="gw-video-newnote" onSubmit={publish}>
          <div className="gw-video-newnote-head"><strong>Comentario en {formatTime(composing.time_ms, { precise: true })}</strong><button type="button" className="gw-video-icon" aria-label="Cancelar comentario" onClick={() => { setComposing(null); setBody(''); }}><X size={16} aria-hidden="true" /></button></div>
          {composing.drawing && <div className="gw-video-palette" role="group" aria-label="Color del trazo">{DRAW_COLORS.map(([value, name]) => <button key={value} type="button" aria-label={name} aria-pressed={drawColor === value} style={{ '--swatch': value }} onClick={() => setDrawColor(value)} />)}
            <button type="button" className="gw-video-undo" disabled={!composing.drawing.length} onClick={() => setComposing(c => ({ ...c, drawing: c.drawing.slice(0, -1) }))}><Undo2 size={14} aria-hidden="true" />Deshacer trazo</button>
            <small>{composing.drawing.length ? `${composing.drawing.length} trazo${composing.drawing.length === 1 ? '' : 's'}` : 'Dibuja sobre el video con el puntero.'}</small></div>}
          {!composing.drawing && <button type="button" className="gw-video-link" onClick={() => setComposing(c => ({ ...c, drawing: [] }))}><Brush size={14} aria-hidden="true" />Añadir dibujo</button>}
          <label>Qué hay que revisar<textarea value={body} maxLength={4000} onChange={e => setBody(e.target.value)} placeholder="Por ejemplo: la mascota entra demasiado rápido." disabled={busy || working} autoFocus /></label>
          <div className="gw-form-actions"><button type="submit" className="gw-primary" disabled={busy || working || !body.trim()}>Publicar comentario</button></div>
        </form>}
      </div>
      <aside className="gw-video-side" aria-label="Comentarios del video">
        <div className="gw-opal-inbox-tabs" role="group" aria-label="Panel de revisión de video">
          <button type="button" aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>Comentarios <span>{notes.length}</span></button>
          <button type="button" aria-pressed={tab === 'files'} onClick={() => setTab('files')}>Entrega</button></div>
        {tab === 'files' ? <div className="gw-video-delivery-info">
          <h3>v{version.version_number} · {version.change_summary}</h3>
          {asset && <p><strong>{asset.file_name}</strong><br /><small>{asset.width} × {asset.height} · {formatTime(asset.duration_ms ?? version.duration_ms)} · {fileSize(asset.size_bytes)}{asset.audio_codec ? '' : ' · sin audio'}</small></p>}
          {version.note && <><h4>Nota de entrega</h4><p className="gw-video-pre">{version.note}</p></>}
          {version.credits && <p><strong>Crédito</strong><br />{version.credits}</p>}
          <PublicationList data={data} />
        </div> : <>
          {!notes.length && <p className="gw-image-hint">Aún no hay comentarios. {canNote ? 'Pausa donde quieras y pulsa «Comentar en este momento».' : ''}</p>}
          <ol className="gw-video-notes">{notes.map(n => <li key={n.id} data-selected={n.id === selectedId || undefined} data-resolved={n.resolved || undefined}>
            <button type="button" className="gw-video-note-pick" aria-pressed={n.id === selectedId} onClick={() => pick(n)}>
              <span className="gw-video-stamp">{formatTime(n.time_ms)}</span><span><strong>{person(data, n.author_id)}</strong><small>{n.previous ? `De v${n.version_number} · ` : ''}{noteStatus(n)}{n.drawing ? ' · Con dibujo' : ''}</small></span></button>
            <p className="gw-video-pre">{n.body}</p>
            {n.id === selectedId && <div className="gw-video-note-detail">
              {replies.map(r => <article key={r.id}><small>{person(data, r.author_id)} · {dateLabel(r.created_at)}</small><p className="gw-video-pre">{r.body}</p></article>)}
              {canReply && <form onSubmit={async e => { e.preventDefault(); if (reply.trim() && await action('note.reply', { note_id: n.id, body: reply.trim() })) setReply(''); }}>
                <label className="gw-sr-only" htmlFor={`reply-${n.id}`}>Responder</label><textarea id={`reply-${n.id}`} value={reply} maxLength={4000} onChange={e => setReply(e.target.value)} placeholder="Responder…" disabled={busy || working} />
                <button type="submit" disabled={busy || working || !reply.trim()}>Responder</button></form>}
              {open && !n.resolved && (reviewer || n.author_id === actorId) && (n.previous
                ? reviewer && <button type="button" disabled={busy || working} onClick={() => void action('note.verify', { note_id: n.id, verified_version_id: version.id, resolved: true })}>Marcar como atendido en v{version.version_number}</button>
                : <button type="button" disabled={busy || working} onClick={() => void action('note.resolve', { note_id: n.id, resolved: true })}>Marcar como resuelto</button>)}
              {open && n.resolved && (reviewer || n.author_id === actorId) && !n.previous && <button type="button" disabled={busy || working} onClick={() => void action('note.resolve', { note_id: n.id, resolved: false })}>Reabrir</button>}
            </div>}
          </li>)}</ol>
        </>}
        {error && <p role="alert" className="gw-image-error">{error}</p>}
      </aside>
    </div>
    {changesAllowed && <form className="gw-image-request-changes" onSubmit={async e => {
      e.preventDefault(); if (reason.trim().length < 5 && !openNotes.length) return; setWorking(true);
      try { await command('review.changes', { deliverable_id: task.id, body: reason.trim() || `Revisar los ${openNotes.length} comentarios del video (v${version.version_number}).` }, task.revision); setReason(''); } finally { setWorking(false); }
    }}><h3>Pedir cambios</h3><label>Motivo{openNotes.length ? ' (opcional: se enviarán los comentarios abiertos)' : ' (escribe un motivo o publica un comentario)'}<textarea value={reason} onChange={e => setReason(e.target.value)} disabled={busy || working} /></label>
      {task.round >= 1 + (task.extra_rounds || 0) ? <p>Dirección debe autorizar otra ronda antes de devolver el video.</p> : <button className="gw-wk-btn" disabled={busy || working || (!openNotes.length && reason.trim().length < 5)}>Pedir cambios</button>}</form>}
  </section>;
}
