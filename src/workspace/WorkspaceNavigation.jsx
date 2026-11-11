import React, { useRef } from 'react';
import { BookOpen, Layers, Settings, RefreshCw, Archive } from 'lucide-react';
import workspaceIcon from '../../src-tauri/icons/64x64.png';
import { isVideoProduction } from './productionKinds.mjs';

const EDITION_SECTIONS = { work: 'Mi trabajo', assignments: 'Asignaciones', reviews: 'Revisión', documents: 'Documentos', team: 'Equipo', calendar: 'Calendario' };

export function WorkspaceNavigation({ screen, onScreenChange, context, unitName, name, loading, onRefresh, previewMode, blocked, notifications, closedCount = 0 }) {
  return <header className="gw-topbar" aria-hidden={blocked || undefined}>
    <div className="gw-brand"><img src={workspaceIcon} width="32" height="32" alt="" /><strong>Workspace</strong><span>{unitName}</span></div>
    <nav className="gw-global-nav" aria-label="Menú general">
      <button type="button" aria-current={screen === 'editions' ? 'page' : undefined} onClick={() => onScreenChange('editions')}><Layers size={16} aria-hidden="true" />Producciones</button>
      <button type="button" aria-current={screen === 'closed' ? 'page' : undefined} onClick={() => onScreenChange('closed')}><Archive size={16} aria-hidden="true"/>Cerradas{closedCount>0 && <small>{closedCount}</small>}</button>
      {context?.keynotes_access && <button type="button" aria-current={screen === 'keynotes' ? 'page' : undefined} onClick={() => onScreenChange('keynotes')}><BookOpen size={16} aria-hidden="true" />Keynotes</button>}
    </nav>
    <div className="gw-account">
      <span className="gw-account-name">{name}</span>{notifications}
      <button type="button" className="gw-refresh" aria-label="Actualizar Workspace" title="Actualizar Workspace" disabled={loading} onClick={onRefresh}><RefreshCw size={16} aria-hidden="true" /></button>
      <button type="button" aria-label="Configuración" aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => onScreenChange('settings')}><Settings size={16} aria-hidden="true" /><span>Configuración</span></button>
    </div>
  </header>;
}

export function EditionTabs({ projects, selectedId, onSelect, busy, closed = false }) {
  const buttons = useRef([]);
  const selectedIndex = Math.max(0, projects.findIndex(project => project.id === selectedId));

  function move(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % projects.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + projects.length) % projects.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = projects.length - 1;
    else return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onSelect(projects[next].id);
  }

  return <div className="gw-edition-strip">
    <span className="gw-edition-label">{closed ? 'Cerradas' : 'Producciones'}</span>
    <div className="gw-edition-tabs" role="tablist" aria-label={closed ? 'Producciones cerradas' : 'Producciones en trabajo'}>
      {projects.map((project, index) => <button
        type="button" role="tab" key={project.id} id={`workspace-edition-${project.id}`}
        aria-selected={project.id === selectedId} aria-controls="workspace-edition-panel"
        tabIndex={index === selectedIndex ? 0 : -1} disabled={busy}
        ref={element => { buttons.current[index] = element; }}
        onKeyDown={event => move(event, index)} onClick={() => onSelect(project.id)}
      >{project.title}{isVideoProduction(project) && <small>Video</small>}{project.status === 'archived' && <small>Archivada</small>}</button>)}
    </div>
  </div>;
}

export function EditionNavigation({ section, onSelect, canAssign, canReview, canWork, canTeam = false }) {
  return <nav className="gw-section-nav" aria-label="Trabajo de la producción">
    {Object.entries(EDITION_SECTIONS).filter(([id]) => (id !== 'work' || canWork) && (id !== 'assignments' || canAssign) && (id !== 'reviews' || canReview) && (id !== 'team' || canTeam)).map(([id, label]) => <button type="button" key={id} aria-current={section === id ? 'page' : undefined} onClick={() => onSelect(id)}>{label}</button>)}
  </nav>;
}
