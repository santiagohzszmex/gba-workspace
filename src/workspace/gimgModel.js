export const PLATFORM_ROLES = { gba_platform_owner: 'Administración técnica de GBA' };
export const GIMG_ROLES = {
  gimg_direction: 'Dirección de GIMG',
  gimg_production_lead: 'Responsable de Producción', gimg_workspace_coordinator: 'Coordinación de Workspace',
  gimg_project_director: 'Dirección de producción delegada', gimg_area_lead: 'Responsable de área',
  gimg_contributor: 'Colaborador', gimg_quality_manager: 'Gestión de archivos y QA', gimg_viewer: 'Consulta'
};
export const STATES = { pending:'Pendiente', assigned:'Asignado', in_progress:'En progreso', review:'En revisión', changes_requested:'Cambios solicitados', area_approved:'Aprobado de área', in_qa:'En QA', qa_approved:'QA aprobado', published:'Publicado', archived:'Archivado', blocked:'Bloqueado' };
export const MEMBERSHIP = { accepted:'Aceptado', active:'Activo', continuity_requested:'Continuidad solicitada', continuity_confirmed:'Continuidad confirmada', inactive:'Inactivo', departed:'Baja', suspended:'Suspendido' };
export const PRIORITIES = { low:'Baja', normal:'Normal', high:'Alta', urgent:'Urgente' };
export function dateLabel(value) { return value ? new Date(value).toLocaleString('es-MX', {dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}) : 'Sin fecha'; }
export function inputDate(value) { if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
export function isoDate(value) {return value ? new Date(value).toISOString() : null;}
export function summary(tasks, userId, now = Date.now()) {
  const open=tasks.filter(t=>!['published','archived'].includes(t.state));
  return { mine:open.filter(t=>t.responsible_id===userId || t.collaborator_ids?.includes(userId)), late:open.filter(t=>t.due_at && new Date(t.due_at).getTime()<now), blocked:open.filter(t=>t.state==='blocked'), reviews:open.filter(t=>['review','in_qa'].includes(t.state)) };
}
