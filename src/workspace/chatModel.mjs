// Workspace 1.8.0 Labradorita · Conversación de cada asignación (lógica sin interfaz).
export const CHAT_KINDS = { comment: '', changes: 'Correcciones solicitadas', verified: 'Verificación', qa_issue: 'Incidencia de calidad' };

// Mensajes de una asignación, del más antiguo al más reciente (el último queda abajo, como en un chat).
export function chatMessages(comments = [], taskId) {
  return comments.filter(item => item.deliverable_id === taskId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
}

const time = date => date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
// Hoy: «4:48 p.m.»; ayer: «Ayer, 4:48 p.m.»; antes: «10 nov, 4:48 p.m.».
export function chatTime(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86400000);
  if (diff === 0) return time(date);
  if (diff === 1) return `Ayer, ${time(date)}`;
  const label = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }).replace('.', '');
  return `${label}, ${time(date)}`;
}

// Un mensaje se puede enviar si tiene texto o una imagen.
export function hasContent(document) {
  let text = '', image = false;
  const walk = node => { if (!node) return; if (node.type === 'text') text += node.text || ''; if (node.type === 'originalImage') image = true; (node.content || []).forEach(walk); };
  walk(document);
  return image || text.trim().length > 0;
}

// Sólo se vuelve a dibujar si llegaron mensajes nuevos o cambiaron.
export function sameMessages(a = [], b = []) {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.body === b[i].body);
}
