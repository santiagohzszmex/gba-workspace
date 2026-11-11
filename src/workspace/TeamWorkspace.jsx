import {deadlineStatus,withDeadlineFacts} from './deadlines.mjs';
import {DueLabel} from './workView';
import React from 'react';
import { BookOpen, FileText, Users } from 'lucide-react';
import { REFERENCE_KINDS } from './referenceModel';
import './supportDocuments.css';

const SUPPORT_KIND = { interview:'Entrevista', research:'Investigación', notes:'Notas', source:'Fuente', transcript:'Transcripción', working:'Documento de trabajo' };
const ASSIGNMENT_ROLE = { contributor:'Colaborador',direction:'Dirección', coordination:'Coordinación', production:'Producción', qa:'Calidad', research:'Investigación', writing:'Redacción', illustration:'Ilustración', design:'Diseño', photography:'Fotografía', layout:'Diseño editorial', video_editing:'Edición de video', animation_2d:'Animación 2D', animation_3d:'Animación 3D' };
import { productionNoun } from './productionKinds.mjs';
export default function TeamWorkspace({ project, data, actorId, selectedSupportId, onOpenDocument, onOpenTask }) {
  const areas = data.team?.areas || data.areas.filter(area => area.project_id === project.id);
  const areaName = id => areas.find(area => area.id === id)?.name || 'Área';
  const members = data.team?.members || [];
  const sharedSupport = (data.support?.documents || []).filter(row => row.project_id === project.id && row.share_scope !== 'private');
  const references = (data.references || []).filter(row => row.project_id === project.id);
  const tasks = (data.tasks || []).filter(row => row.project_id === project.id).map(t=>withDeadlineFacts(t,data)).sort((a,b)=>{const score=t=>({late:0,today:1,soon:2}[deadlineStatus(t).key]??3);return score(a)-score(b)||(new Date(a.due_at||8640000000000000)-new Date(b.due_at||8640000000000000));});
  const counts=id=>{const rows=tasks.filter(t=>t.responsible_id===id||t.collaborator_ids?.includes(id));return {late:rows.filter(t=>deadlineStatus(t).key==='late').length,soon:rows.filter(t=>['today','soon'].includes(deadlineStatus(t).key)).length};};
  const memberName = id => members.find(member => member.user_id === id)?.display_name || (id === actorId ? 'Tú' : 'Integrante');
  return <section className="gw-team-space" aria-label={`Equipo de ${project.title}`}>
    <header><div><span className="gw-wk-eyebrow">{project.title}</span><h1>Equipo</h1><p>Integrantes y materiales compartidos que puedes consultar según tu acceso.</p></div></header>
    <section className="gw-team-members"><h2><Users size={18}/>Integrantes del equipo</h2>{members.length ? <ul>{members.map(member => <li key={member.user_id}><strong>{member.display_name || member.handle || 'Integrante'}</strong><span className="gw-team-deadlines">{counts(member.user_id).late} vencidas · {counts(member.user_id).soon} por vencer</span>{member.handle && <span>@{member.handle.replace(/^@/,'')}</span>}<small>{(member.area_ids || []).map(areaName).join(' · ') || `Equipo de la ${productionNoun(project)}`}{member.assignment_roles?.length ? ` · ${member.assignment_roles.map(role=>ASSIGNMENT_ROLE[role] || role).join(', ')}` : ''}</small></li>)}</ul> : <p>Los integrantes disponibles aparecerán aquí.</p>}</section>
    <div className="gw-team-materials">
      <section><h2><FileText size={18}/>Documentos compartidos</h2>{sharedSupport.length ? <ul>{sharedSupport.map(row => <li key={row.id}><button type="button" aria-current={row.id === selectedSupportId || undefined} onClick={() => onOpenDocument?.(row)}><strong>{row.title}</strong><small>{SUPPORT_KIND[row.document_kind] || row.document_kind} · {areaName(row.area_id)} · {memberName(row.author_id)}</small></button></li>)}</ul> : <p>Cuando alguien comparta un documento con el área, aparecerá aquí.</p>}</section>
      <section><h2><BookOpen size={18}/>Referencias de la {productionNoun(project)}</h2>{references.length ? <ul>{references.map(row => <li key={row.id}><button type="button" onClick={() => onOpenDocument?.(row)}><strong>{row.title}</strong><small>{row.area_id ? row.area_name || areaName(row.area_id) : `Toda la ${productionNoun(project)}`}{row.kind ? ` · ${REFERENCE_KINDS[row.kind] || row.kind}` : ''}</small></button></li>)}</ul> : <p>No hay referencias disponibles para esta {productionNoun(project)}.</p>}</section>
      <section><h2><FileText size={18}/>Asignaciones accesibles</h2>{tasks.length ? <ul>{tasks.map(row => <li key={row.id}><button type="button" onClick={() => onOpenTask?.(row)}><strong>{row.title}</strong><small>{areaName(row.area_id)} · {memberName(row.responsible_id)}</small><DueLabel task={row}/></button></li>)}</ul> : <p>No hay asignaciones accesibles en esta {productionNoun(project)}.</p>}</section>
    </div>
  </section>;
}
