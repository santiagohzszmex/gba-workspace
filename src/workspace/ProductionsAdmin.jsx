import React, { useState } from 'react';
import { BookOpen, Clapperboard, Plus, Pencil, X, ArrowLeft } from 'lucide-react';
import { CommandForm } from './ui';
import { dateLabel } from './gimgModel';
import { PRODUCTION_KINDS, productionKind } from './productionKinds.mjs';
import { RemoveProduction, RemovedProductions } from './EditionRemoval';
import './productionsAdmin.css';

// Workspace 1.8.0 Labradorita · Configuración › Administrar producciones.
const STATUS = { planned: 'Planeada', active: 'Activa', closed: 'Cerrada', archived: 'Archivada' };
const GROUPS = [['current', 'En curso', ['active', 'planned']], ['closed', 'Cerradas', ['closed']], ['archived', 'Archivadas', ['archived']]];
const KIND_DETAILS = {
  publication: { Icon: BookOpen, text: 'Revistas, ediciones y textos.', areas: ['Investigación', 'Editorial', 'Ilustración', 'Diseño y maquetación', 'QA'] },
  video: { Icon: Clapperboard, text: 'Videos, cortos y animaciones.', areas: ['Guion', 'Storyboard y animatic', 'Arte y personajes', 'Animación 3D', 'Animación 2D', 'Edición y montaje', 'Publicación en redes'] }
};
const DATE_FIELDS = { starts_at: { label: 'Inicio', type: 'datetime-local', optional: true }, ends_at: { label: 'Cierre', type: 'datetime-local', optional: true } };

export function groupProductions(projects) {
  return GROUPS.map(([id, label, states]) => ({ id, label, items: projects.filter(project => states.includes(project.status)) }));
}

function period(project) {
  if (!project.starts_at && !project.ends_at) return 'Sin fechas';
  return `${project.starts_at ? dateLabel(project.starts_at) : 'Sin inicio'} → ${project.ends_at ? dateLabel(project.ends_at) : 'sin cierre'}`;
}

function KindLabel({ project }) {
  const kind = productionKind(project), { Icon } = KIND_DETAILS[kind];
  return <span className="gw-production-kind" data-kind={kind}><Icon size={13} aria-hidden="true" />{PRODUCTION_KINDS[kind]}</span>;
}

export function NewProduction({ busy, onCreate, onCancel, initialKind = null }) {
  const [kind, setKind] = useState(initialKind);
  return <section className="gw-production-new" aria-labelledby="gw-production-new-title">
    <div className="gw-production-new-head"><h3 id="gw-production-new-title">{kind ? `Nueva producción · ${PRODUCTION_KINDS[kind]}` : '¿Qué vas a producir?'}</h3><button type="button" className="gw-production-icon" aria-label="Cancelar" disabled={busy} onClick={onCancel}><X size={17} aria-hidden="true" /></button></div>
    {!kind ? <div className="gw-production-kinds" role="group" aria-label="Tipo de producción">{Object.entries(KIND_DETAILS).map(([id, { Icon, text, areas }]) => <button type="button" key={id} disabled={busy} onClick={() => setKind(id)}>
      <span className="gw-production-kind-icon"><Icon size={22} aria-hidden="true" /></span><strong>{PRODUCTION_KINDS[id]}</strong><span>{text}</span>
      <small>Áreas: {areas.join(' · ')}</small></button>)}</div>
    : <><p className="gw-production-areas">Se crearán estas áreas: {KIND_DETAILS[kind].areas.join(' · ')}.</p>
      <CommandForm busy={busy} button="Crear producción" fields={{ title: 'Nombre', ...DATE_FIELDS }} onSave={values => onCreate({ ...values, kind })} />
      <button type="button" className="gw-production-back" disabled={busy} onClick={() => setKind(null)}><ArrowLeft size={14} aria-hidden="true" />Cambiar tipo</button></>}
  </section>;
}

function ProductionRow({ project, permissions, command, busy, onRemove, editing, onEdit, onClose }) {
  const canEdit = permissions['project.update'], canRemove = permissions['project.archive'];
  const statuses = { planned: STATUS.planned, active: STATUS.active, closed: STATUS.closed, ...(canRemove ? { archived: STATUS.archived } : {}) };
  return <li className="gw-production-row" data-editing={editing || undefined}>
    <div className="gw-production-summary">
      <div><strong>{project.title}</strong><div className="gw-production-meta"><KindLabel project={project} /><span className="gw-production-status" data-status={project.status}>{STATUS[project.status] || project.status}</span><span>{period(project)}</span></div></div>
      {(canEdit || canRemove) && (editing ? <button type="button" className="gw-production-icon" aria-label={`Cerrar cambios de ${project.title}`} disabled={busy} onClick={onClose}><X size={17} aria-hidden="true" /></button>
        : <button type="button" disabled={busy} onClick={onEdit}><Pencil size={14} aria-hidden="true" />Editar</button>)}
    </div>
    {editing && <div className="gw-production-edit">
      {canEdit && <CommandForm key={project.id + project.revision} initial={project} busy={busy} button="Guardar cambios" fields={{ title: 'Nombre', status: { label: 'Estado', options: statuses }, ...DATE_FIELDS }} onSave={values => command('project.save', { ...values, project_id: project.id }, project.revision)} />}
      {canRemove && <RemoveProduction project={project} onRemove={onRemove} busy={busy} />}
    </div>}
  </li>;
}

export default function ProductionsAdmin({ projects, permissions, command, busy, removed = [], onRemove, onRestore }) {
  const [creating, setCreating] = useState(false), [editingId, setEditingId] = useState(null);
  async function create(values) { await command('project.create', values); setCreating(false); }
  return <div className="gw-productions-admin">
    <div className="gw-productions-head"><div><h2>Producciones</h2><p>Cada producción tiene su equipo, sus áreas, sus entregas y su calendario.</p></div>
      {permissions['project.create'] && !creating && <button type="button" className="gw-primary" disabled={busy} onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Nueva producción</button>}</div>
    {creating && <NewProduction busy={busy} onCreate={create} onCancel={() => setCreating(false)} />}
    {groupProductions(projects).filter(group => group.id === 'current' || group.items.length).map(group => <section key={group.id} className="gw-productions-group" aria-labelledby={`gw-productions-${group.id}`}>
      <h3 id={`gw-productions-${group.id}`}>{group.label} <span>{group.items.length}</span></h3>
      {group.items.length ? <ul>{group.items.map(project => <ProductionRow key={project.id} project={project} permissions={permissions} command={command} busy={busy} onRemove={onRemove}
        editing={editingId === project.id} onEdit={() => setEditingId(project.id)} onClose={() => setEditingId(null)} />)}</ul>
        : <p className="gw-productions-empty">No hay producciones en curso.</p>}
    </section>)}
    <RemovedProductions removed={removed} onRestore={onRestore} busy={busy} />
  </div>;
}
