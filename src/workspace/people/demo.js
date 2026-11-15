import { functionArea, productionKind } from '../productionKinds.mjs';
// Isolated local preview. This adapter never calls Supabase or creates real access.
import matrix from '../permissionMatrix.json';
import { DEMO_ACTORS, demoPermissions } from '../workflowDemo';
import { CARGOS } from './catalog';
import { live, statusOf, expiry } from './model';
const stores=new Map();
export function createPeopleDemo(data,actorId,projectId){
 const actor=Object.values(DEMO_ACTORS).find(a=>a.id===actorId),members=Object.values(DEMO_ACTORS).filter(a=>a.role!=='gba_platform_owner');
 if(!stores.has('gimg-demo')){
  const state={unit:{id:'gimg-demo',name:'GIMG'},profiles:members.map(a=>({id:a.id,name:a.name,handle:a.id})),memberships:members.map(a=>({unit_id:'gimg-demo',user_id:a.id,membership_status:'active',expires_at:null})),projects:data.projects.map(p=>({...p,name:p.title,short:p.title})),areas:data.areas.slice(),grants:[],assignments:[],delegations:[],briefs:[],audit:[],catalog:CARGOS,matrix};
  members.forEach((a,index)=>{const scope=a.area?'area':['gimg_project_director','gimg_viewer'].includes(a.role)?'project':'unit',id='demo-principal-'+index;
   state.grants.push({id,user_id:a.id,access_role:a.role,scope_type:scope,scope_id:scope==='area'?a.area:scope==='project'?a.projects[0]:'gimg-demo',starts_at:new Date(Date.now()-86400000).toISOString(),expires_at:a.role==='gimg_project_director'?new Date(Date.now()+30*86400000).toISOString():null,reason:'Registro de demostración'});
   state.assignments.push({id:'demo-function-'+index,user_id:a.id,grant_id:id,project_id:a.projects[0],area_id:a.area || null,assignment_role:a.role==='gimg_area_lead'?'area_lead':a.area==='research-demo'?'research':a.area==='text-demo'?'writing':a.area?'illustration':a.role==='gimg_quality_manager'?'qa':a.role==='gimg_direction'?'direction':'production',starts_at:new Date(Date.now()-86400000).toISOString(),expires_at:null});
  });
  const locked=['platform.manage','unit.roles.grant','asset.delete_physical','publication.approve_final'];
  state.delegableKeys=[...new Set(Object.values(matrix).flatMap(r=>Object.keys(r)))].filter(key=>!locked.includes(key)&&Object.entries(matrix).some(([role,permissions])=>permissions[key]==='D'||role==='gimg_project_director'&&permissions[key]==='P'&&!['unit.read','project.read','task.read','content.read','unit.members.read','audit.read_scoped'].includes(key)));
  stores.set('gimg-demo',state);
 }
 const state=stores.get('gimg-demo');let sequence=0;const id=kind=>`${kind}-${Date.now()}-${++sequence}`;
 const permissions=()=>demoPermissions(actor,projectId,actor.area || null);
 const need=key=>{if(!permissions()[key])throw Error('Esta función corresponde a Dirección o requiere una delegación vigente.');};
 return {async load(){return {...JSON.parse(JSON.stringify(state)),permissions:permissions()};},async findProfile(gbaId){need('unit.members.invite');const profile=state.profiles.find(p=>p.handle.toLowerCase()===gbaId.replace(/^@/,'').trim().toLowerCase()) || (gbaId.replace(/^@/,'').trim().toLowerCase()==='cuentaprueba'?{id:'demo-new-member',name:'Cuenta de prueba',handle:'cuentaprueba'}:null);return profile?{profile,alreadyMember:state.memberships.some(m=>m.user_id===profile.id)}:null;},async mutate(action,value){
  need(action==='invite'?'unit.members.invite':action==='membership'&&value.status==='suspended'?'unit.members.suspend':'unit.roles.grant');
  const uid=value.userId || value.delegateId || state.grants.find(g=>g.id===value.grantId)?.user_id || state.delegations.find(d=>d.id===value.delegationId)?.delegate_user_id;
  const member=state.memberships.find(m=>m.user_id===uid);let result={};
  if(action==='invite'){
   if(member)throw Error('Esta persona ya es integrante.');
   const profile={id:uid,name:'Cuenta de prueba',handle:'cuentaprueba'};state.profiles.push(profile);state.memberships.push({user_id:uid,unit_id:state.unit.id,membership_status:value.mode==='reserve'?'accepted':'active',expires_at:value.expiresAt});result={userId:uid};
  }else if(action==='membership'){Object.assign(member,{membership_status:value.status,suspended_at:value.status==='suspended'?new Date().toISOString():null,...(value.status==='active'?{expires_at:value.expiresAt}:{} )});}
  else if(action==='remove' || action==='expiry'){const g=state.grants.find(g=>g.id===value.grantId);if(action==='remove'){g.revoked_at=new Date().toISOString();state.assignments.filter(a=>a.grant_id===g.id).forEach(a=>a.expires_at=g.revoked_at);}else{g.expires_at=expiry(value.expiresAt?'custom':'none',null,member,value.expiresAt?.slice(0,10)).date;state.assignments.filter(a=>a.grant_id===g.id).forEach(a=>a.expires_at=g.expires_at);}}
  else if(action==='revoke'){state.delegations.find(d=>d.id===value.delegationId).revoked_at=new Date().toISOString();}
  else if(action==='assign'){
   if(statusOf(member)!=='active')throw Error('La persona debe tener acceso activo.');
   const c=CARGOS.find(c=>c.key===value.cargoKey);const fn=value.functionKey || c.assignmentRole;
   // Misma regla que el servidor: área elegida a mano o la equivalente a la función según el tipo de producción.
   const project=state.projects.find(p=>p.id===value.projectId),[specialty,areaName]=functionArea(project,fn)||['art','Ilustración'];
   let area=value.areaId?state.areas.find(a=>a.id===value.areaId&&a.project_id===value.projectId):state.areas.find(a=>a.project_id===value.projectId && a.specialty===specialty && (productionKind(project)!=='publication' || ((fn!=='photography' || a.name==='Fotografía') && (fn==='photography' || a.name!=='Fotografía'))));
   if(c.scope==='area'&&value.areaId&&!area)throw Error('El área no pertenece a esa producción');
   if(c.scope==='area'&&!area){area={id:id('demo-area'),project_id:value.projectId,name:areaName,specialty};state.areas.push(area);}
   const scopeId=c.scope==='unit'?state.unit.id:c.scope==='project'?value.projectId:area.id;
   if(state.grants.some(g=>g.user_id===uid&&g.scope_type===c.scope&&g.scope_id===scopeId&&live(g)))throw Error('Ya existe un cargo vigente en ese alcance.');
   const grant={id:id('demo-grant'),user_id:uid,cargo_key:c.key,access_role:value.accessRole || c.accessRole,scope_type:c.scope,scope_id:scopeId,expires_at:value.expiresAt,starts_at:new Date().toISOString(),reason:value.reason};state.grants.push(grant);
   if(fn)state.assignments.push({id:id('demo-assignment'),user_id:uid,grant_id:grant.id,project_id:value.projectId,area_id:area?.id,function_key:fn,assignment_role:fn,expires_at:value.expiresAt});result=grant;
  }else if(action==='delegate'){
   if(!value.permissionKeys.length || value.permissionKeys.some(k=>!state.delegableKeys.includes(k)) || !value.expiresAt || value.brief.length<20 || value.brief.includes('[escribe el motivo]'))throw Error('Completa los permisos, vigencia y mandato escrito.');
   const brief={id:id('demo-brief'),text:value.brief,created_at:new Date().toISOString()};state.briefs.push(brief);state.delegations.push({id:id('demo-delegation'),delegate_user_id:uid,delegated_by:actorId,scope_type:value.scopeType==='unit'?'unit':value.areaId?'area':'project',scope_id:value.scopeType==='unit'?state.unit.id:value.areaId || value.projectId,permission_keys:value.permissionKeys,starts_at:new Date().toISOString(),expires_at:value.expiresAt,written_brief_id:brief.id});
  }
  state.audit.unshift({id:id('demo-audit'),at:new Date().toISOString(),actor:actorId,action:({assign:'people.cargo_assigned',invite:'member.save',membership:'member.save',remove:'grant.revoke',expiry:'grant.save',delegate:'delegation.save',revoke:'delegation.revoke'})[action],object_id:result.id || uid,detail:{resolved_user_id:uid,reason:value.reason}});
  return result;
 }};
}
