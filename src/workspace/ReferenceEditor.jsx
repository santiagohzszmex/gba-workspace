import React, { useEffect, useRef, useState } from 'react';
import { Plus, Upload, X } from 'lucide-react';
import { REFERENCE_KINDS, canManageReference, parsePalette, validatePalette, validateOriginal, fileSize } from './referenceModel';
import { documentText } from './documentModel';
const RichDocument = React.lazy(() => import('./RichDocument'));
import { productionNoun } from './productionKinds.mjs';
export function Palette({ colors = [] }) { return colors.length > 0 && <div className="gw-reference-palette" aria-label="Paleta de colores">{colors.map(color => <span key={color}><i style={{backgroundColor: color}} aria-hidden="true" /><code>{color}</code></span>)}</div>; }
export default function ReferenceEditor({ reference, initialValue, project, data, permissions, onSave, onUpload, onClose, onDirtyChange, busy }) {
  const available = Object.keys(REFERENCE_KINDS).filter(kind => canManageReference(kind, null, permissions) || (kind === 'instructions' && data.areas.some(area => canManageReference(kind, area.id, permissions, data.areaPermissions))));
  const [value, setValue] = useState(() => reference || initialValue || { title: '', kind: available[0], area_id: available[0] === 'instructions' && !canManageReference('instructions', null, permissions) ? data.areas.find(area => canManageReference('instructions', area.id, permissions, data.areaPermissions))?.id : null, content_document: null, content_markdown: '', palette: [] });
  const [savedReference, setSavedReference] = useState(reference || null);
  const [pendingFile, setPendingFile] = useState(null);
  const [paletteText, setPaletteText] = useState((reference?.palette || []).join(' '));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const baseline = useRef(JSON.stringify(value));
  const baselinePalette = useRef(paletteText);
  const textDirty = JSON.stringify(value) !== baseline.current || paletteText !== baselinePalette.current;
  const dirty = textDirty || Boolean(pendingFile);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const colors = parsePalette(paletteText);
  function change(patch, initial = false) { setValue(current => { const next = { ...current, ...patch }; if (initial) baseline.current = JSON.stringify({ ...JSON.parse(baseline.current), ...patch }); return next; }); }
  async function save(event) {
    event.preventDefault(); if (saving || busy) return; setError('');
    if (!validatePalette(colors)) { setError('Usa hasta 24 colores con códigos de seis dígitos, por ejemplo #673AB7.'); return; }
    if (!value.content_document) return;
    if (!savedReference && !pendingFile && !documentText(value.content_document).trim() && !colors.length && value.kind !== 'moodboard') { setError('Añade texto, una paleta o un archivo de referencia.'); return; }
    setSaving(true);
    try {
      const saved = await onSave({ ...value, editor_version:2, ...(savedReference ? {id: savedReference.id} : {}), palette: colors, project_id: project.id, ...(initialValue && !savedReference ? {from_legacy_brief:true} : {}) }, savedReference?.revision || 0);
      if (!saved) throw Error('No se pudo guardar. Inténtalo de nuevo.');
      setSavedReference(saved); setValue(saved); baseline.current = JSON.stringify(saved); baselinePalette.current = colors.join(' '); setPaletteText(colors.join(' '));
      if (pendingFile) {
        try { const uploaded = await onUpload(saved, pendingFile); if (!uploaded) throw Error('Espera a que termine la operación actual y reintenta.'); }
        catch (failure) { throw Error(`La referencia está guardada, pero el archivo no se subió. Puedes reintentar sin crear otra referencia. ${failure.message}`); }
        setPendingFile(null);
      }
      onDirtyChange?.(false); onClose(saved.id);
    }
    catch (failure) { setError(failure.message); } finally { setSaving(false); }
  }
  async function upload(event) {
    const input = event.currentTarget, file = input.files?.[0]; if (!file) return; setError('');
    try { validateOriginal(file, value.kind, data.referenceStorage); input.value = ''; if (!savedReference) { setPendingFile(file); return; } setSaving(true); const uploaded = await onUpload(savedReference, file); if (!uploaded) throw Error('Espera a que termine la operación actual y reintenta.'); }
    catch (failure) { setError(failure.message); } finally { setSaving(false); }
  }
  return <form className="gw-reference-editor" onSubmit={save}><div className="gw-reference-editor-heading"><div><p className="gw-eyebrow">Referencia de {project.title}</p><h2>{savedReference ? 'Editar referencia' : initialValue ? 'Editar concepto' : 'Nueva referencia'}</h2></div><button type="button" onClick={() => onClose()} aria-label="Cerrar edición de referencia"><X size={18} /></button></div>
    <div className="gw-reference-fields"><label>Tipo de referencia<select value={value.kind} disabled={Boolean(savedReference || initialValue) || saving || busy} onChange={event => change({ kind: event.target.value, area_id: event.target.value === 'instructions' && !canManageReference('instructions', null, permissions) ? data.areas.find(area => canManageReference('instructions', area.id, permissions, data.areaPermissions))?.id : null })}>{available.map(kind => <option key={kind} value={kind}>{REFERENCE_KINDS[kind]}</option>)}</select></label>
      <label>Título<input required maxLength={180} value={value.title} disabled={saving || busy} onChange={event => change({title: event.target.value})} placeholder="Nombre claro para el equipo" /></label>
      {value.kind === 'instructions' && <label>Área<select disabled={Boolean(savedReference || initialValue) || saving || busy} value={value.area_id || ''} onChange={event => change({area_id:event.target.value || null})}>{canManageReference('instructions', null, permissions) && <option value="">Toda la {productionNoun(project)}</option>}{data.areas.filter(area => area.project_id === project.id && canManageReference('instructions', area.id, permissions, data.areaPermissions)).map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>}

    </div>
    <React.Suspense fallback={<p role="status">Abriendo editor…</p>}><RichDocument scope={{kind:'reference',referenceId:savedReference?.id,projectId:project.id,areaId:value.area_id}} palette={colors} onSave={() => void save({preventDefault(){}})} initialDocument={value.content_document} initialMarkdown={value.content_markdown} onChange={change} disabled={saving || busy} /></React.Suspense>
    <div className="gw-reference-details"><label>Paleta de la referencia<input value={paletteText} onChange={event => setPaletteText(event.target.value)} disabled={saving || busy} placeholder="#673AB7 #F4ECE0" /><small>Códigos HEX separados por espacios. Selecciona texto en el editor para cambiar su color o tipografía.</small></label>{validatePalette(colors) && <Palette colors={colors} />}
      <div className="gw-reference-upload"><h3>Archivos de referencia · PDF e imágenes</h3><p>Hasta {data.referenceStorage?.file_limit_bytes ? fileSize(data.referenceStorage.file_limit_bytes) : 'límite del servidor'} por archivo, sin comprimir ni redimensionar. Puedes añadir un archivo aunque no escribas texto.</p><label className="gw-upload-button"><Upload size={16} />{pendingFile ? 'Cambiar archivo' : 'Añadir archivo original'}<input type="file" aria-label="Archivo original de referencia" accept="image/jpeg,image/png,image/webp,image/gif,image/tiff,image/avif,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,.avif,.heic,.heif,.pdf" onChange={event => void upload(event)} disabled={saving || busy || (Boolean(savedReference) && textDirty) || !data.referenceStorage?.gateway_url} /></label>{pendingFile && <p className="gw-pending-original"><span>{pendingFile.name} · listo para subir al guardar</span><button type="button" disabled={saving || busy} onClick={() => setPendingFile(null)} aria-label="Quitar archivo pendiente"><X size={16} /></button></p>}{!data.referenceStorage?.gateway_url && <p>El almacenamiento está pendiente de conexión.</p>}{textDirty && savedReference && <small>Guarda los cambios de texto antes de añadir otro original.</small>}</div>
    </div>{error && <p role="alert" className="gw-error">{error}</p>}<div className="gw-reference-editor-footer"><span>{dirty ? 'Cambios sin guardar' : savedReference ? 'Referencia guardada' : 'Nueva referencia'}</span><button type="submit" className="gw-primary" disabled={saving || busy || !value.content_document}>{saving ? 'Guardando…' : pendingFile ? 'Guardar y subir archivo' : savedReference ? 'Guardar cambios' : initialValue ? 'Guardar concepto' : <><Plus size={15} />Crear referencia</>}</button></div>
  </form>;
}
