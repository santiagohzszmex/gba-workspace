import React, { useState } from 'react';
import EditionRemoval from './EditionRemoval';
import LicensePanel from './LicensePanel';
import TeamPanel from './TeamPanel';
import ConnectorSessions from './ConnectorSessions';
import { Activity, CommandForm, rpc } from './ui';
import { dateLabel } from './gimgModel';
import { PRODUCTION_KINDS } from './productionKinds.mjs';

export default function WorkspaceSettings({ context, data, permissions, command, busy, loading, unitId, projectId, onUnitChange, onProjectChange, previewMode, onNotice, actorId, peopleCommand, removedEditions = [], onRemoveEdition, onRestoreEdition }) {
  const [section, setSection] = useState('general');
  const sections = { general: 'General', connections: 'Conexiones' };
  if (permissions['unit.members.read']) sections.team = 'Integrantes y permisos';
  if (permissions['project.create'] || permissions['project.update'] || permissions['project.archive'] || removedEditions.length) sections.projects = 'Administrar producciones';
  if (permissions['audit.read_scoped'] || permissions['audit.export_full']) sections.audit = 'Actividad';
  if (context?.platform_owner) sections.licenses = 'Licencias';
  const currentSection = sections[section] ? section : 'general';
  const project = data.projects.find(item => item.id === projectId);

  async function exportAudit() {
    try {
      const result = await rpc('workspace_export_audit', { p_unit: unitId });
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'auditoria-workspace.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { onNotice(error.message); }
  }

  return <section className="gw-settings">
    {currentSection!=='team' && <div className="gw-page-heading"><p className="gw-eyebrow">Workspace</p><h1>Configuración</h1><p>Administración del espacio, accesos y ediciones.</p></div>}
    <div className="gw-settings-layout">
      <nav className="gw-settings-nav" aria-label="Configuración de Workspace">{Object.entries(sections).map(([id, label]) => <button type="button" key={id} aria-current={currentSection === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}</nav>
      <div className="gw-settings-content">
        {loading ? <p role="status">Cargando configuración…</p> : <>
        {currentSection === 'general' && <><h2>Espacio de trabajo</h2><label>Unidad activa<select value={unitId} disabled={busy || !context?.units?.length} onChange={event => onUnitChange(event.target.value)}>{context?.units?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><p>Cada edición conserva sus propios documentos, entregables y calendario.</p><p>Los controles disponibles dependen de tu asignación en GIMG. La administración de GBA y los permisos editoriales se gestionan por separado.</p></>}
        {(currentSection==='projects' || currentSection==='team' && !permissions['directory.unit_wide']) && data.projects.length > 0 && <label className="gw-settings-project">{currentSection==='team'?'Edición del directorio':'Edición para administrar'}<select value={projectId} disabled={busy} onChange={event => onProjectChange(event.target.value)}>{data.projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
        {currentSection === 'team' && <TeamPanel data={data} permissions={permissions} command={command} busy={busy} unitId={unitId} projectId={projectId} actorId={actorId} peopleCommand={peopleCommand} previewMode={previewMode} onNotice={onNotice} />}
        {currentSection === 'projects' && <><h2>Administrar producciones</h2>{permissions['project.create'] && <details className="gw-disclosure"><summary>Crear producción</summary><CommandForm busy={busy} button="Crear producción" fields={{ kind: { label: 'Tipo de producción', options: PRODUCTION_KINDS }, title: 'Nombre', starts_at: { label: 'Inicio', type: 'datetime-local', optional: true }, ends_at: { label: 'Cierre', type: 'datetime-local', optional: true } }} onSave={values => command('project.create', values)} /></details>}
          {project && permissions['project.update'] && <CommandForm key={project.id + project.revision} initial={project} busy={busy} button="Guardar edición" fields={{ title: 'Nombre', status: { label: 'Estado', options: { planned: 'Planeada', active: 'Activa', closed: 'Cerrada', ...(permissions['project.archive'] ? { archived: 'Archivada' } : {}) } }, starts_at: { label: 'Inicio', type: 'datetime-local', optional: true }, ends_at: { label: 'Cierre', type: 'datetime-local', optional: true } }} onSave={values => command('project.save', values, project.revision)} />}
          <EditionRemoval key={project?.id || unitId} project={project} removed={removedEditions} canRemove={permissions['project.archive']} onRemove={onRemoveEdition} onRestore={onRestoreEdition} busy={busy && !previewMode}/><div className="gw-list">{data.projects.map(item => <article key={item.id}><h3>{item.title}</h3><p>{dateLabel(item.starts_at)} → {dateLabel(item.ends_at)}</p><button type="button" disabled={busy} onClick={() => onProjectChange(item.id)}>Seleccionar edición</button></article>)}</div>
        </>}
        {currentSection === 'audit' && <><h2>Actividad de Workspace</h2>{permissions['audit.export_full'] && <button type="button" disabled={busy} onClick={() => void exportAudit()}>Exportar auditoría completa</button>}<p>Últimas 200 acciones visibles según tu alcance.</p><Activity rows={data.audit} /></>}
        {currentSection === 'licenses' && context?.platform_owner && <LicensePanel previewMode={previewMode} />}
        {currentSection === 'connections' && <ConnectorSessions previewMode={previewMode} onNotice={onNotice} />}
        </>}
      </div>
    </div>
  </section>;
}
