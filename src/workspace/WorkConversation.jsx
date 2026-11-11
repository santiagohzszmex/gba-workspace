import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { CommandForm } from './ui';
import StructuredDocument from './StructuredDocument';
import { useDocumentContext } from './DocumentContext';
import { documentText } from './documentModel';
import { CHAT_KINDS, chatMessages, chatTime, hasContent } from './chatModel.mjs';
import './taskChat.css';

const RichDocument = React.lazy(() => import('./RichDocument'));
const SYNC_MS = 15000;

// Workspace 1.8.0 Labradorita · Conversación de la asignación, tipo chat.
// Vive en la asignación y queda registrada para la revisión. Los mensajes nuevos llegan sin recargar.
export default function WorkConversation({ task, data, command, busy }) {
  const context = useDocumentContext(), actorId = context.actorId;
  const permissions = data.taskPermissions?.[task.id] || {};
  const messages = chatMessages(data.comments, task.id);
  const canWrite = Boolean(command && permissions['content.comment']);
  const [draft, setDraft] = useState(null), [editorKey, setEditorKey] = useState(0), [sending, setSending] = useState(false), [error, setError] = useState('');
  const list = useRef(null), latest = useRef(null);
  latest.current = { draft, sending, busy };

  // Mensajes nuevos sin recargar: cada 15 segundos con la ventana visible, y al volver a ella.
  useEffect(() => {
    if (!command || !context.syncComments) return undefined;
    const sync = () => { if (document.visibilityState === 'visible') void context.syncComments(task.id).catch(() => {}); };
    const timer = setInterval(sync, SYNC_MS);
    window.addEventListener('focus', sync); document.addEventListener('visibilitychange', sync);
    return () => { clearInterval(timer); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
  }, [task.id, Boolean(command), Boolean(context.syncComments)]);
  // El mensaje más reciente queda a la vista.
  useEffect(() => { const box = list.current; if (box) box.scrollTop = box.scrollHeight; }, [task.id, messages.length]);

  if (!messages.length && !canWrite && !permissions['qa.raise_issue']) return null;

  async function send() {
    const { draft: document, sending: wait, busy: blocked } = latest.current;
    if (wait || blocked || !hasContent(document)) return;
    setSending(true); setError('');
    try {
      const text = documentText(document);
      await command('comment.add', { deliverable_id: task.id, project_id: task.project_id, body: text, body_document: document, editor_version: 2 }, task.revision);
      setDraft(null); setEditorKey(key => key + 1);
    } catch (failure) { setError(failure.message || 'No se pudo enviar el mensaje.'); }
    finally { setSending(false); }
  }

  const person = id => data.members?.find(member => member.user_id === id)?.display_name || 'Integrante';
  return <section className="gw-chat" aria-label="Conversación de la asignación">
    <div className="gw-chat-head"><MessageCircle size={16} aria-hidden="true" /><h3>Conversación</h3>{messages.length > 0 && <span>{messages.length}</span>}</div>
    <p className="gw-chat-note">La ven quienes tienen acceso a esta asignación y queda registrada para la revisión.</p>
    <ol className="gw-chat-list" ref={list} aria-live="polite" aria-relevant="additions">
      {!messages.length && <li className="gw-chat-empty">Todavía no hay mensajes. Escribe aquí en lugar de mandar archivos por otros medios.</li>}
      {messages.map(message => {
        const own = message.actor_id === actorId, kind = CHAT_KINDS[message.kind];
        return <li key={message.id} className="gw-chat-message" data-own={own || undefined} data-kind={message.kind}>
          <div className="gw-chat-meta"><strong>{own ? 'Tú' : person(message.actor_id)}</strong><time dateTime={message.created_at}>{chatTime(message.created_at)}</time>{message.version_number > 0 && <small>v{message.version_number}</small>}</div>
          <div className="gw-chat-bubble">{kind && <span className="gw-chat-kind">{kind}</span>}{message.body_document ? <StructuredDocument document={message.body_document} /> : <p>{message.body}</p>}</div>
        </li>;
      })}
    </ol>
    {canWrite && <div className="gw-chat-composer">
      <React.Suspense fallback={<p role="status">Abriendo conversación…</p>}>
        <RichDocument key={`chat-${task.id}-${editorKey}`} compact placeholder="Escribe un mensaje. @ para mencionar." ariaLabel="Mensaje para la conversación"
          scope={{ kind: 'comment', attachments: true, taskId: task.id, projectId: task.project_id, areaId: task.area_id }}
          onChange={(value, hydrated) => { if (!hydrated) setDraft(value.content_document); }} onSubmit={() => void send()} disabled={sending || busy} />
      </React.Suspense>
      <div className="gw-chat-actions"><small>Enter envía · Mayús + Enter, salto de línea · Puedes pegar capturas</small>
        <button type="button" className="gw-primary" disabled={sending || busy || !hasContent(draft)} onClick={() => void send()}><Send size={14} aria-hidden="true" />{sending ? 'Enviando…' : 'Enviar'}</button></div>
      {error && <p role="alert" className="gw-error">{error}</p>}
    </div>}
    {command && permissions['qa.raise_issue'] && <details className="gw-disclosure gw-chat-issue"><summary>Reportar un problema con la entrega</summary>
      <CommandForm key={`issue-${task.id}`} busy={busy} resetOnSuccess button="Registrar incidencia" fields={{ body: { label: 'Describe el problema y qué se necesita resolver', type: 'richtext', scope: { kind: 'comment', taskId: task.id, projectId: task.project_id, areaId: task.area_id } } }} onSave={values => command('qa.issue', { ...values, deliverable_id: task.id, project_id: task.project_id }, task.revision)} />
    </details>}
  </section>;
}
