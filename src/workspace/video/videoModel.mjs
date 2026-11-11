// Workspace 1.8.0 Labradorita · Lógica de video sin interfaz (se prueba sin navegador).
export const VIDEO_NETWORKS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', x: 'X', threads: 'Threads', other: 'Otra red' };
export const DRAW_COLORS = [['#e5484d', 'Rojo'], ['#f5d90a', 'Amarillo'], ['#30a46c', 'Verde'], ['#0091ff', 'Azul'], ['#ffffff', 'Blanco'], ['#111111', 'Negro']];
export const DEFAULT_POLICY = { max_bytes: 314572800, max_seconds: 600, max_long_side: 1280, max_short_side: 720, purge_hours: 48 };
export const FRAME_MS = 1000 / 24;

// 42000 → «0:42»; con precisión, «0:42.0». Horas sólo si hacen falta.
export function formatTime(ms, { precise = false } = {}) {
  const total = Math.max(0, Number(ms) || 0), tenths = Math.floor(total / 100) % 10;
  const seconds = Math.floor(total / 1000), h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return precise ? `${base}.${tenths}` : base;
}

export const fileSize = bytes => !bytes ? '0 MB' : bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;

// Revisión local antes de subir: avisa al momento y con la solución, sin esperar al servidor.
export function videoProblem({ name = '', size = 0, width = 0, height = 0, durationMs = 0 } = {}, policy = DEFAULT_POLICY) {
  const p = { ...DEFAULT_POLICY, ...policy };
  if (!/\.(mp4|m4v)$/i.test(name)) return /\.mov$/i.test(name) ? 'Es un video QuickTime (.mov). Expórtalo como MPEG-4 (.mp4).' : 'Sube un video MP4 (.mp4).';
  if (size > p.max_bytes) return `El video pesa ${fileSize(size)}. El máximo es ${fileSize(p.max_bytes)}: expórtalo a 720p.`;
  if (width && height && (Math.max(width, height) > p.max_long_side || Math.min(width, height) > p.max_short_side)) return `El video es de ${width} × ${height}. La copia de revisión debe ser de 720p como máximo (1280 × 720 u horizontal/vertical equivalente).`;
  if (durationMs > p.max_seconds * 1000) return `El video dura ${formatTime(durationMs)}. El máximo es ${Math.round(p.max_seconds / 60)} minutos.`;
  return '';
}

// Errores del servidor o de la red, en palabras para quien sube.
export function uploadMessage(error) {
  const text = String(error?.message || error || '');
  if (error?.name === 'AbortError' || /pausad/i.test(text)) return 'Subida pausada. Selecciona el mismo archivo para continuar.';
  if (/Failed to fetch|NetworkError|conexión se interrumpió|Load failed/i.test(text)) return 'Se cortó la conexión. Vuelve a elegir el mismo archivo para continuar donde se quedó.';
  return text || 'No se pudo subir el video.';
}

// Trazos: coordenadas relativas, redondeadas y con un máximo de puntos (el servidor rechaza más de 500).
export function simplifyStroke(points, max = 500) {
  const clean = points.map(([x, y]) => [Math.round(Math.min(1, Math.max(0, x)) * 10000) / 10000, Math.round(Math.min(1, Math.max(0, y)) * 10000) / 10000])
    .filter((p, i, all) => i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]);
  if (clean.length <= max) return clean;
  const step = (clean.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => clean[Math.round(i * step)]);
}

// Comentarios visibles en una versión: los suyos y los anteriores, con su estado.
export function videoNotes(bundle, versions, version) {
  if (!version) return [];
  const byId = Object.fromEntries(versions.map(v => [v.id, v]));
  return (bundle?.notes || []).filter(n => byId[n.version_id] && byId[n.version_id].version_number <= version.version_number)
    .map(n => {
      const source = byId[n.version_id];
      const resolution = (bundle.resolutions || []).filter(r => r.note_id === n.id && byId[r.verified_version_id]?.version_number <= version.version_number).at(-1);
      return { ...n, version_number: source.version_number, previous: source.version_number < version.version_number, resolved: Boolean(resolution?.resolved), verified_version: byId[resolution?.verified_version_id]?.version_number || null };
    })
    .sort((a, b) => a.version_number - b.version_number || a.time_ms - b.time_ms || String(a.created_at).localeCompare(String(b.created_at)));
}

export function noteStatus(note) {
  if (!note.resolved) return 'Abierto';
  return note.verified_version && note.verified_version > note.version_number ? `Atendido en v${note.verified_version}` : 'Resuelto';
}

// Adivina la red a partir del enlace pegado.
export function networkFromUrl(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\.|^m\./, ''); } catch { return null; }
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
  if (/(^|\.)(facebook\.com|fb\.watch)$/.test(host)) return 'facebook';
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return 'x';
  if (/(^|\.)threads\.(net|com)$/.test(host)) return 'threads';
  return 'other';
}

export const validPublicationUrl = url => /^https:\/\/[^\s/]+\.[^\s]+$/.test(String(url || '').trim()) && String(url).length <= 2000;

export function purgeLabel(asset, now = Date.now()) {
  if (!asset) return '';
  if (asset.purged) return 'La copia de revisión se borró después de publicar el video. Los comentarios y dibujos se conservan.';
  if (!asset.purge_due_at) return '';
  const hours = Math.max(0, Math.round((new Date(asset.purge_due_at).getTime() - now) / 3600000));
  return hours >= 24 ? `Esta copia se borrará en ${Math.round(hours / 24)} día${Math.round(hours / 24) === 1 ? '' : 's'}, porque el video ya se publicó.` : `Esta copia se borrará en ${Math.max(1, hours)} hora${hours === 1 ? '' : 's'}, porque el video ya se publicó.`;
}

// Ajuste de Blender: MP4 H.264 + AAC, a la mayor resolución de 720p que respete la proporción de la escena.
export const BLENDER_SCRIPT = `# Workspace · Copia de revisión 720p (GIMG)
# En Blender: pestaña Scripting > Abrir este archivo > botón Ejecutar (▶).
# Cambia sólo la salida de ESTA escena: MP4 (H.264 + AAC) y tamaño de hasta 1280 × 720.
# Tu escena conserva su resolución base; sólo baja el porcentaje de render.
import bpy

LONG, SHORT = 1280, 720
scene = bpy.context.scene
r = scene.render

def size(percent):
    return (r.resolution_x * percent // 100, r.resolution_y * percent // 100)

best = None
for percent in range(100, 0, -1):
    w, h = size(percent)
    if max(w, h) <= LONG and min(w, h) <= SHORT and w % 2 == 0 and h % 2 == 0:
        best = percent
        break
if best is None:
    raise RuntimeError("No se encontró un tamaño válido de 720p para esta escena.")
r.resolution_percentage = best

settings = r.image_settings
if hasattr(settings, "media_type"):
    settings.media_type = 'VIDEO'
settings.file_format = 'FFMPEG'
f = r.ffmpeg
f.format = 'MPEG4'
f.codec = 'H264'
f.constant_rate_factor = 'MEDIUM'
f.ffmpeg_preset = 'GOOD'
f.audio_codec = 'AAC'
f.audio_bitrate = 128
f.audio_channels = 'STEREO'

fps = r.fps / r.fps_base
seconds = (scene.frame_end - scene.frame_start + 1) / fps
w, h = size(best)
message = f"Listo: {w} × {h}, MP4 H.264 + AAC, {seconds:.1f} s. Renderiza la animación y sube el .mp4 a Workspace."
if seconds > 600:
    message += " Atención: dura más de 10 minutos; Workspace no la aceptará."

def draw(self, context):
    self.layout.label(text=message)

print(message)
if bpy.context.window_manager:
    bpy.context.window_manager.popup_menu(draw, title="Workspace · Copia de revisión", icon='INFO')
`;
export const BLENDER_SCRIPT_NAME = 'workspace-copia-revision-720p.py';
