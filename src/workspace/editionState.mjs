export const isClosedEdition = project => ['closed','archived'].includes(project?.status);
export function editionsForScreen(projects, screen) {
  return projects.filter(project => !project.deleted_at && isClosedEdition(project) === (screen === 'closed'));
}
export function selectedEdition(projects, currentId, screen) {
  const choices = ['editions','closed'].includes(screen) ? editionsForScreen(projects,screen) : projects.filter(p=>!p.deleted_at);
  return choices.find(p=>p.id===currentId)?.id || choices[0]?.id || '';
}
export const consultationPermissions = permissions => Object.fromEntries(Object.entries(permissions || {}).map(([key,value])=>[key,Boolean(value && (/\.read(?:_|$)/.test(key) || key.startsWith('asset.download_')))]));
export function closedEditionData(data) {
  const maps = name => Object.fromEntries(Object.entries(data[name] || {}).map(([id,p])=>[id,consultationPermissions(p)]));
  return {...data, referencePermissions:consultationPermissions(data.referencePermissions),areaPermissions:maps('areaPermissions'),taskPermissions:maps('taskPermissions'),
    support:{...data.support,creation_areas:[],documents:(data.support?.documents || []).map(row=>({...row,can_edit:false,can_convert:false}))},
    images:{...data.images,uploads_enabled:false},video:{...data.video,uploads_enabled:false}};
}
