import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { FRAME_MS, formatTime, simplifyStroke } from './videoModel.mjs';

// Enlace de reproducción: se pide a la pasarela y se renueva solo si vence mientras se revisa.
export function useStreamUrl(api, asset) {
  const [state, setState] = useState({ url: '', message: '', loading: Boolean(asset) });
  const renewed = useRef(0);
  async function load() {
    if (!asset) { setState({ url: '', message: '', loading: false }); return; }
    if (asset.local_url) { setState({ url: asset.local_url, message: '', loading: false }); return; }
    if (asset.purged) { setState({ url: '', message: 'La copia de revisión se borró después de publicar el video. Los comentarios y dibujos se conservan.', loading: false }); return; }
    setState(s => ({ ...s, loading: true }));
    try {
      const link = await api('link', null, { assetId: asset.id });
      setState(link.available === false ? { url: '', message: link.message || 'La copia no está disponible.', loading: false } : { url: link.url, message: '', loading: false });
    } catch (error) { setState({ url: '', message: error.message || 'No se pudo abrir el video.', loading: false }); }
  }
  useEffect(() => { renewed.current = 0; void load(); }, [asset?.id, asset?.purged, asset?.local_url]);
  const renew = async () => { if (Date.now() - renewed.current < 15000) return false; renewed.current = Date.now(); await load(); return true; };
  return { ...state, renew };
}

// Capa de dibujo sobre el cuadro. Coordenadas relativas (0 a 1) para que valgan a cualquier tamaño.
export function DrawingLayer({ strokes = [], editable = false, color = '#e5484d', width = 4, onChange }) {
  const [current, setCurrent] = useState(null);
  const point = event => { const box = event.currentTarget.getBoundingClientRect(); return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]; };
  const all = current ? [...strokes, current] : strokes;
  return <svg className="gw-video-drawing" data-editable={editable || undefined} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden={!editable || undefined}
    role={editable ? 'img' : undefined} aria-label={editable ? 'Dibuja sobre el cuadro con el puntero' : undefined}
    onPointerDown={editable ? event => { event.currentTarget.setPointerCapture?.(event.pointerId); const first = point(event); setCurrent({ color, width, points: [first] }); } : undefined}
    onPointerMove={editable && current ? event => { const next = point(event); setCurrent(stroke => stroke && ({ ...stroke, points: [...stroke.points, next] })); } : undefined}
    onPointerUp={editable && current ? () => { const done = { ...current, points: simplifyStroke(current.points) }; setCurrent(null); if (done.points.length) onChange?.([...strokes, done].slice(-40)); } : undefined}
    onPointerCancel={() => setCurrent(null)}>
    {all.map((stroke, i) => stroke.points.length === 1
      ? <circle key={i} cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={0.004 * stroke.width} fill={stroke.color} />
      : <polyline key={i} points={stroke.points.map(p => p.join(',')).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
  </svg>;
}

// Un video con su capa encima. El marco toma la proporción del archivo para que la capa coincida con la imagen.
export const VideoSurface = forwardRef(function VideoSurface({ api, asset, label, muted = false, overlay, onTime, onDuration, onPlaying }, ref) {
  const video = useRef(null), restore = useRef(null);
  const stream = useStreamUrl(api, asset);
  useImperativeHandle(ref, () => video.current, [stream.url]);
  const ratio = asset?.width && asset?.height ? `${asset.width} / ${asset.height}` : '16 / 9';
  async function failed() {
    const element = video.current; if (!element) return;
    restore.current = { time: element.currentTime, playing: !element.paused };
    await stream.renew();
  }
  return <figure className="gw-video-surface" style={{ '--gw-video-ratio': ratio }}>
    <div className="gw-video-frame">
      {stream.url ? <video ref={video} src={stream.url} preload="metadata" playsInline muted={muted} aria-label={label}
        onLoadedMetadata={event => { onDuration?.(event.currentTarget.duration * 1000); if (restore.current) { event.currentTarget.currentTime = restore.current.time; if (restore.current.playing) void event.currentTarget.play().catch(() => {}); restore.current = null; } }}
        onTimeUpdate={event => onTime?.(event.currentTarget.currentTime * 1000)} onSeeked={event => onTime?.(event.currentTarget.currentTime * 1000)}
        onPlay={() => onPlaying?.(true)} onPause={() => onPlaying?.(false)} onEnded={() => onPlaying?.(false)} onError={() => void failed()} />
        : <div className="gw-video-empty" role="status">{stream.loading ? 'Abriendo video…' : stream.message || 'Sin video.'}</div>}
      {stream.url && overlay}
    </div>
    {label && <figcaption>{label}</figcaption>}
  </figure>;
});

// Controles compartidos: uno o varios videos (comparación) avanzan juntos.
export function VideoControls({ videos, durationMs, timeMs, playing, markers = [], selectedId, onMarker, onSeek }) {
  const each = fn => videos().forEach(element => element && fn(element));
  const seek = ms => { const t = Math.max(0, Math.min(durationMs || 0, ms)) / 1000; each(element => { element.pause(); element.currentTime = Math.min(t, element.duration || t); }); onSeek?.(t * 1000); };
  const toggle = () => { if (playing) each(element => element.pause()); else each(element => { void element.play().catch(() => {}); }); };
  return <div className="gw-video-controls" onKeyDown={event => {
    if (event.target.tagName === 'INPUT' && event.target.type !== 'range') return;
    if (event.key === ' ' && event.target.tagName !== 'BUTTON') { event.preventDefault(); toggle(); }
    if (event.key === 'ArrowLeft' || event.key === ',') { event.preventDefault(); seek(timeMs - FRAME_MS); }
    if (event.key === 'ArrowRight' || event.key === '.') { event.preventDefault(); seek(timeMs + FRAME_MS); }
  }}>
    <div className="gw-video-buttons">
      <button type="button" className="gw-video-icon" aria-label="Cuadro anterior" title="Cuadro anterior (,)" onClick={() => seek(timeMs - FRAME_MS)}><SkipBack size={16} aria-hidden="true" /></button>
      <button type="button" className="gw-video-icon gw-video-play" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={toggle}>{playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}</button>
      <button type="button" className="gw-video-icon" aria-label="Cuadro siguiente" title="Cuadro siguiente (.)" onClick={() => seek(timeMs + FRAME_MS)}><SkipForward size={16} aria-hidden="true" /></button>
      <span className="gw-video-time" aria-live="off">{formatTime(timeMs, { precise: true })} <small>/ {formatTime(durationMs, { precise: true })}</small></span>
    </div>
    <div className="gw-video-timeline">
      <input type="range" min="0" max={Math.max(1, Math.round(durationMs || 0))} step="1" value={Math.round(Math.min(timeMs, durationMs || 0))} aria-label="Posición del video" aria-valuetext={formatTime(timeMs, { precise: true })} onChange={event => seek(Number(event.target.value))} />
      {durationMs > 0 && markers.length > 0 && <div className="gw-video-timeline-markers">
        {markers.map(marker => <button key={marker.id} type="button" className="gw-video-marker" data-selected={marker.id === selectedId || undefined} data-resolved={marker.resolved || undefined}
          style={{ left: `${Math.min(100, (marker.time_ms / durationMs) * 100)}%` }} aria-label={`Comentario en ${formatTime(marker.time_ms)}`} title={formatTime(marker.time_ms)} onClick={() => onMarker?.(marker)}>
          <span className="gw-video-marker-time" aria-hidden="true">{formatTime(marker.time_ms)}</span>
        </button>)}
      </div>}
    </div>
  </div>;
}

// Reproductor completo: un video (o dos sincronizados para comparar) con marcas de comentarios y dibujo.
export function VideoPlayer({ api, asset, compareAsset, compareLabel, label, markers, selectedId, onMarker, onTime, onPlaying, drawing, editableDrawing, drawColor, onDrawingChange, playerRef }) {
  const main = useRef(null), other = useRef(null);
  const [timeMs, setTimeMs] = useState(0), [durationMs, setDurationMs] = useState(asset?.duration_ms || 0), [playing, setPlaying] = useState(false);
  useEffect(() => { setTimeMs(0); setPlaying(false); setDurationMs(asset?.duration_ms || 0); }, [asset?.id]);
  const videos = () => [main.current, other.current].filter(Boolean);
  // El segundo video sigue al primero: si se separan más de un décimo de segundo, se corrige.
  const follow = ms => { setTimeMs(ms); onTime?.(ms); const b = other.current; if (b && Math.abs(b.currentTime * 1000 - ms) > 100 && ms / 1000 <= (b.duration || Infinity)) b.currentTime = ms / 1000; };
  useImperativeHandle(playerRef, () => ({
    seek: ms => { videos().forEach(element => { element.pause(); element.currentTime = ms / 1000; }); follow(ms); },
    pause: () => videos().forEach(element => element.pause()),
    time: () => (main.current?.currentTime || 0) * 1000
  }));
  const layer = (drawing?.length || editableDrawing) ? <DrawingLayer strokes={drawing || []} editable={editableDrawing} color={drawColor} onChange={onDrawingChange} /> : null;
  return <div className="gw-video-player" data-compare={compareAsset ? true : undefined}>
    <div className="gw-video-surfaces">
      <VideoSurface ref={main} api={api} asset={asset} label={compareAsset ? label : undefined} overlay={layer} onTime={follow} onDuration={ms => setDurationMs(Math.max(ms, compareAsset?.duration_ms || 0))} onPlaying={value => { setPlaying(value); onPlaying?.(value); }} />
      {compareAsset && <VideoSurface ref={other} api={api} asset={compareAsset} label={compareLabel} muted />}
    </div>
    <VideoControls videos={videos} durationMs={durationMs} timeMs={timeMs} playing={playing} markers={markers} selectedId={selectedId} onMarker={onMarker} onSeek={follow} />
  </div>;
}
