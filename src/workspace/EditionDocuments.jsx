import { fileSize } from './referenceModel';
import React, { useState, useCallback } from 'react';
import { productionNoun } from './productionKinds.mjs';
import ReactMarkdown from 'react-markdown';
import { FileText, Search, BookOpen, Plus, Pencil, Image, Archive } from 'lucide-react';
import StructuredDocument from './StructuredDocument';
import ReferenceEditor, { Palette } from './ReferenceEditor';
import ReferenceOriginal from './ReferenceOriginal';
import ReferenceHistory from './ReferenceHistory';
import DraftExitDialog from './DraftExitDialog';
import { REFERENCE_KINDS, canManageReference } from './referenceModel';
import './referenceCategories.css';
import { dateLabel } from './gimgModel';
import { taskIsMine } from './documentModel';
export function DocumentContent({ content }) { return <div className="gw-document-content"><ReactMarkdown skipHtml>{content || ''}</ReactMarkdown></div>; }
export default function EditionDocuments({ project, data, actorId, onOpenTask, initialTaskId, initialReferenceId, permissions = {}, referenceApi, onDirtyChange, busy, compact = false }) {
  const references = data.references || [], documents = data.approvedDocuments || [];
  const referencePermissions = data.referencePermissions || permissions;
  const [selectedId, setSelectedId] = useState(() => initialReferenceId || documents.find(document => document.deliverable_id === initialTaskId)?.version_id || references[0]?.id || 'brief');
  const [search, setSearch] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [pending, setPending] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState('');
  const selected = references.find(document => document.id === selectedId);
  const accepted = documents.find(document => document.version_id === selectedId);
  const isBrief = !selected && !accepted;
  const title = selected?.title || accepted?.title || 'Concepto y dirección';
  const ownTask = accepted && data.tasks.find(task => task.id === accepted.deliverable_id && taskIsMine(task, actorId));
  const showBrief = !references.some(reference => reference.kind === 'concept') && (Boolean(project.brief) || references.length === 0);
  const query = search.trim().toLocaleLowerCase('es');
  const matches = value => !query || value.toLocaleLowerCase('es').includes(query);
  const writable = !['closed','archived'].includes(project.status) && Boolean(referenceApi) && (canManageReference('concept', null, referencePermissions) || canManageReference('instructions', null, referencePermissions) || Object.values(data.areaPermissions || {}).some(area => area['reference.manage_instructions']));
  const canEdit = selected && writable && selected.can_edit;
  const canEditLegacy = isBrief && Boolean(project.brief) && writable && canManageReference('concept', null, referencePermissions);
  function navigate(action) { if (draftDirty) setPending(() => action); else action(); }
  function select(id) { navigate(() => { setSelectedId(id); setEditing(false); setArchiving(false); setError(''); }); }
  const dirty = useCallback(value => { setDraftDirty(value); onDirtyChange?.(value); }, [onDirtyChange]);
  async function archive() { try { await referenceApi('reference.archive', selected, selected.revision); setArchiving(false); setSelectedId('brief'); } catch (failure) { setError(failure.message); } }
  const library = [{label:`Referencias de la ${productionNoun(project)}`, rows:[...(showBrief ? [{id:'brief', title:'Concepto y dirección', label:'Referencia anterior', icon:BookOpen, areaId:null}] : []), ...references.map(reference => ({id:reference.id, title:reference.title, label:`${REFERENCE_KINDS[reference.kind]}${reference.area_name ? ` · ${reference.area_name}` : ''}`, icon:reference.kind === 'moodboard' ? Image : BookOpen, areaId:reference.area_id || null}))]}, {label:'Documentos aceptados', rows:documents.map(document => ({id:document.version_id, title:document.title, label:`${document.area_name} · Aceptado · v${document.version_number}`, icon:FileText, areaId:document.area_id || null}))}];
  const visibleLibrary = library.map(group => ({...group, rows:group.rows.filter(row => matches(`${row.title} ${row.label}`) && (!filterArea || (filterArea === '__general__' ? !row.areaId : row.areaId === filterArea)))}));
  const selectedHiddenByFilters = Boolean(selected && !visibleLibrary.some(group => group.rows.some(row => row.id === selected.id)));
  const areaOptions = data.areas.filter(area => area.project_id === project.id);
  return <div className={`gw-document-browser${compact ? ' gw-document-compact' : ''}`}>
    <h1 className="gw-sr-only">Documentos de {project.title}</h1>
    <aside className="gw-file-sidebar" aria-label={`Documentos disponibles para la ${productionNoun(project)}`}><div className="gw-file-heading"><h2>Documentos</h2><span>{references.length + documents.length + Number(showBrief)}</span></div>
      {compact ? <label className="gw-reference-picker">Consultar<select value={selectedId} onChange={event => select(event.target.value)}>{library.map(group => <optgroup key={group.label} label={group.label}>{group.rows.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</optgroup>)}</select></label> : <><label className="gw-file-search"><Search size={15} aria-hidden="true" /><span className="gw-sr-only">Buscar documentos de esta {productionNoun(project)}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar documento" /></label><div className="gw-reference-filters"><label>Área<select aria-label="Filtrar por área" value={filterArea} onChange={event => setFilterArea(event.target.value)}><option value="">Todas las áreas</option><option value="__general__">Toda la {productionNoun(project)}</option>{areaOptions.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label></div>{selectedHiddenByFilters && <p className="gw-reference-filter-note" role="status">La referencia abierta sigue seleccionada, aunque estos filtros la oculten de la lista.</p>}{writable && <button type="button" className="gw-new-reference" disabled={busy} onClick={() => navigate(() => { setEditing('new'); setArchiving(false); })}><Plus size={16} />Nueva referencia</button>}
        {visibleLibrary.map(group => <React.Fragment key={group.label}><p className="gw-library-label">{group.label}</p><div className="gw-file-list">{group.rows.map(row => { const Icon = row.icon; return <button type="button" key={row.id} className={selectedId === row.id ? 'gw-file-active' : ''} aria-current={selectedId === row.id ? 'true' : undefined} onClick={() => select(row.id)}><Icon size={17} aria-hidden="true" /><span><strong>{row.title}</strong><small>{row.label}</small></span></button>; })}{!group.rows.length && <p className="gw-file-empty">{group.label === 'Documentos aceptados' ? 'No hay documentos aceptados con estos filtros.' : 'No hay referencias con estos filtros.'}</p>}</div></React.Fragment>)}</>}{writable && data.referenceStorage?.capacity_bytes && <div className="gw-reference-storage"><span>Originales privados</span><progress aria-label="Espacio ocupado por originales" value={data.referenceStorage.used_bytes} max={data.referenceStorage.capacity_bytes} /><small>{(data.referenceStorage.used_bytes / 1_000_000_000).toFixed(2)} de 10 GB · {data.referenceStorage?.file_limit_bytes ? fileSize(data.referenceStorage.file_limit_bytes) : 'límite del servidor'} por archivo</small></div>}
    </aside>
    <section className="gw-document-view" aria-label={title}>{editing && !compact ? <ReferenceEditor key={typeof editing === 'string' ? editing : selected.id} reference={typeof editing === 'string' ? null : selected} initialValue={editing === 'legacy' ? {title:`Concepto de ${project.title}`,kind:'concept',area_id:null,content_document:null,content_markdown:project.brief,palette:[]} : undefined} project={project} data={data} permissions={referencePermissions} busy={busy} onDirtyChange={dirty} onSave={(value, revision) => referenceApi('reference.save', value, revision)} onUpload={(reference, file) => referenceApi('reference.upload', reference, file)} onClose={id => { if (id) { setSelectedId(id); setEditing(false); dirty(false); } else navigate(() => { setEditing(false); dirty(false); }); }} /> : <><div className="gw-document-toolbar"><span>{selected ? REFERENCE_KINDS[selected.kind] : accepted ? 'Versión aceptada para consulta' : 'Referencia para trabajar'}</span><div>{canEditLegacy && !compact && <button type="button" disabled={busy} onClick={() => setEditing('legacy')}><Pencil size={14} />Editar concepto</button>}{canEdit && !compact && <><button type="button" disabled={busy} onClick={() => setEditing(true)}><Pencil size={14} />Editar referencia</button><button type="button" disabled={busy} onClick={() => setArchiving(true)} aria-label="Archivar referencia"><Archive size={14} /></button></>}{ownTask && onOpenTask && <button type="button" onClick={() => onOpenTask(ownTask)}>Ir a mi trabajo</button>}</div></div>
      {archiving && selected && <div className="gw-reference-archive"><p>¿Archivar «{selected.title}»? Dejará de aparecer en la biblioteca. Sus originales e historial se conservan.</p><button type="button" disabled={busy} onClick={() => void archive()}>Archivar referencia</button><button type="button" onClick={() => setArchiving(false)}>Cancelar</button></div>}{error && <p role="alert" className="gw-error">{error}</p>}
      <article className="gw-document-paper"><p className="gw-eyebrow">{project.title}{selected?.area_name ? ` · ${selected.area_name}` : ''}</p><h2>{title}</h2>
        {selected ? <><p className="gw-document-meta">Actualizado {dateLabel(selected.updated_at)}</p><Palette colors={selected.palette} />{selected.content_document ? <StructuredDocument document={selected.content_document} /> : <DocumentContent content={selected.content_markdown} />}{(selected.originals || []).map(asset => <ReferenceOriginal key={asset.id} asset={asset} gateway={data.referenceStorage?.gateway_url} />)}{!compact && <ReferenceHistory key={`${selected.id}-${selected.revision}`} id={selected.id} previewRows={data.referenceHistory?.[selected.id]}/>} {selected.kind === 'moodboard' && !selected.originals?.length && <p className="gw-document-empty">Todavía no se han añadido imágenes o PDF a este moodboard.</p>}</> : isBrief ? project.brief ? <DocumentContent content={project.brief} /> : <div className="gw-reference-empty"><BookOpen size={32} /><h3>Una base común para trabajar</h3><p>Dirección puede añadir el concepto, la dirección creativa y el moodboard. Cada responsable puede preparar las instrucciones de su área.</p>{writable && <button type="button" onClick={() => setEditing('new')}>Crear la primera referencia</button>}</div> : <><p className="gw-document-meta">{accepted.area_name} · Versión {accepted.version_number} · {accepted.imported ? 'Registro histórico' : dateLabel(accepted.approved_at)}</p>{accepted.content_document ? <StructuredDocument document={accepted.content_document} /> : <DocumentContent content={accepted.content_markdown} />}{accepted.credits && <footer className="gw-document-credits"><h3>Créditos</h3><p>{accepted.credits}</p></footer>}</>}
      </article></>}
    </section>{pending && <DraftExitDialog onStay={() => setPending(null)} onDiscard={() => { const next = pending; setPending(null); dirty(false); next(); }} />}
  </div>;
}
