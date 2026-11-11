import React from 'react';
import { UserRound } from 'lucide-react';
import {deadlineDate,deadlineStatus} from './deadlines.mjs';
import { STATES } from './gimgModel';

/* Piezas visuales compartidas por Mi trabajo y Asignaciones.
   Sólo presentación: no leen permisos ni modifican datos. */

export const CLOSED_STATES = ['area_approved', 'in_qa', 'qa_approved', 'published', 'archived'];
const FINISHED_STATES = ['published', 'archived'];
const TONES = { pending: 'idle', assigned: 'info', in_progress: 'info', review: 'wait', changes_requested: 'warn', area_approved: 'ok', in_qa: 'wait', qa_approved: 'ok', published: 'ok', archived: 'idle', blocked: 'danger' };
const TZ = 'America/Mexico_City';
const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = date => {
  const parts = Object.fromEntries(dayFormat.formatToParts(date).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
};
const dayDiff = (a, b) => Math.round((dayKey(a) - dayKey(b)) / 86400000);

export function dateShort(value){return deadlineDate(value);}
export function dueInfo(value,state,now=new Date()){return deadlineStatus({due_at:value,state,current_version:0},now);}

/** "hoy, 12:00 p. m." o "18 oct, 12:00 p. m." para el recibo de guardado. */
export function savedLabel(value, now = new Date()) {
  if (!value) return '';
  const date = new Date(value);
  const time = date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  return `${dayDiff(date, now) === 0 ? 'hoy' : dateShort(value)}, ${time}`;
}

export const isFinished = state => FINISHED_STATES.includes(state);

export function Status({ state,kind }) {
  return <span className="gw-wk-status" data-tone={TONES[state] || 'idle'}><i aria-hidden="true" />{kind==='image'&&state==='area_approved'?'Aprobada por el área':kind==='video'&&state==='area_approved'?'Aprobado por el área':STATES[state] || state}</span>;
}

export const initials = name => (name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export function Avatar({ name }) {
  return name
    ? <span className="gw-wk-avatar" aria-hidden="true">{initials(name)}</span>
    : <span className="gw-wk-avatar gw-wk-avatar-empty" aria-hidden="true"><UserRound size={14} /></span>;
}

export function DueLabel({ task }) {
  const due = deadlineStatus(task);
  return <span className="gw-wk-due" data-tone={due.tone || undefined}>{due.label}{due.relative && <small>{due.relative}</small>}<small>{due.text}</small></span>;
}
