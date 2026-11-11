import {withDeadlineFacts} from '../workspace/deadlines.mjs';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import KeynotesWorkspace from '../workspace/KeynotesWorkspace';
import EditionDocuments from '../workspace/EditionDocuments';
import { EditionCalendar, PersonalWork, AreaAssignments } from '../workspace/EditionWork';
import EditionReviews from '../workspace/EditionReviews';
import TeamWorkspace from '../workspace/TeamWorkspace';
import { taskIsMine, canReviewTask, editionCapabilities, initialSection, hasReviewPermission } from '../workspace/documentModel';
import WorkspaceSettings from '../workspace/WorkspaceSettings';
import ClosedEdition from '../workspace/ClosedEdition';
import {editionsForScreen,selectedEdition,isClosedEdition} from '../workspace/editionState.mjs';
import DraftExitDialog from '../workspace/DraftExitDialog';
import Notifications from '../workspace/Notifications';
import { DocumentContext } from '../workspace/DocumentContext';
import MentionDocument from '../workspace/MentionDocument';
import SaveNotice from '../workspace/SaveNotice';
import { originalMime } from '../workspace/referenceModel';
import { uploadReferenceOriginal } from '../workspace/referenceAssets';
import { WorkspaceNavigation, EditionTabs, EditionNavigation } from '../workspace/WorkspaceNavigation';
import { DEMO_ACTORS, createWorkflowDemo, demoPermissions, workflowDemoData, runWorkflowDemo, demoNotifications } from '../workspace/workflowDemo';
import { rpc } from '../workspace/ui';
import '../workspace/workspace.css';
import '../workspace/images/images.css';
import {imageStorageApi} from '../workspace/images/imageApi';
import {videoStorageApi} from '../workspace/video/videoApi';
import {productionNoun} from '../workspace/productionKinds.mjs';
import {chatMessages,sameMessages} from '../workspace/chatModel.mjs';
import {clearImageCache} from '../workspace/images/originalCache.mjs';

const EMPTY = { projects: [], areas: [], tasks: [], members: [], events: [], audit: [], versions: [], comments: [], assignments: [], grants: [], delegations: [], approvedDocuments: [], references: [], referenceStorage: {}, areaPermissions: {}, taskPermissions: {} };
function savedMessage(action, payload) {
  if (action === 'task.transition' && payload.state === 'area_approved') return payload.video ? 'Video aprobado por el área. Continúa con QA.' : payload.image ? 'Imagen aprobada por el área. Continúa con QA.' : 'Documento aceptado. Ya está disponible en Documentos.';
  return ({'member.save':'Acceso del integrante guardado.','grant.save':'Rol y alcance guardados. Puedes realizar otra asignación.','assignment.save':'Función organizacional guardada.','delegation.save':'Delegación registrada con su vigencia.','grant.revoke':'Rol revocado.','delegation.revoke':'Delegación revocada.','task.assign':'Asignación guardada.','project.save':'Producción guardada.','project.create':'Producción creada. Añade sus referencias y asignaciones.','event.save':'Evento guardado en el calendario.'})[action] || 'Cambios guardados en Workspace.';
}
const TABLES = { projects: 'workspace_projects', areas: 'workspace_areas', tasks: 'workspace_deliverables', events: 'workspace_events', audit: 'workspace_audit', assignments: 'workspace_assignments', grants: 'workspace_access_grants', delegations: 'workspace_delegations' };

export default function Workspace({ previewMode = false }) {
  const { user } = useAuth();
  const [screen, setScreen] = useState('editions');
  const [section, setSection] = useState('auto');
  const [context, setContext] = useState(null);
  const [unitId, setUnitId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedSupportId, setSelectedSupportId] = useState('');
  const [data, setData] = useState(EMPTY);
  const [removedEditions,setRemovedEditions] = useState([]);
  const [notificationTarget,setNotificationTarget] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [demoActorKey, setDemoActorKey] = useState('researcher');
  const demoState = useRef(null), imageDemoModule=useRef(null), videoDemoModule=useRef(null);
  const lapisPreview=previewMode && import.meta.env.DEV && new URLSearchParams(location.search).get('lapis-preview')==='1';
  const videoPreview=previewMode && import.meta.env.DEV && new URLSearchParams(location.search).get('video-preview')==='1';
  const viewDemo=(state,person,id)=>({...workflowDemoData(state,person,id),images:lapisPreview&&imageDemoModule.current?imageDemoModule.current.imageDemoBundle(state,person,id):{enabled:false},video:videoPreview&&videoDemoModule.current?videoDemoModule.current.videoDemoBundle(state,person,id):{enabled:false},ultramar:state.ultramar||{enabled:true,snapshots:{},versions:{}}});
  if (previewMode && !demoState.current) { demoState.current = createWorkflowDemo(); if(import.meta.env.DEV && new URLSearchParams(location.search).get('closed-preview')==='1')demoState.current.projects[0].status='closed'; }
  const actor = DEMO_ACTORS[demoActorKey];
  const generation = useRef(0);
  const userId = previewMode ? actor.id : user?.id;
  const previousImageOwner=useRef(userId);
  useEffect(()=>{if(previousImageOwner.current&&previousImageOwner.current!==userId)void clearImageCache(previousImageOwner.current);previousImageOwner.current=userId;if(previewMode)return;const {data:listener}=supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')void clearImageCache(userId);});return()=>listener.subscription.unsubscribe();},[userId,previewMode]);
  const project = data.projects.find(item => item.id === projectId);
  const task = data.tasks.find(item => item.id === selectedId && item.project_id === projectId);
  const disabled = busy || loading;

  async function load(background = false, requestedScreen = screen) {
    const seq = ++generation.current;
    if (!background) setLoading(true);
    try {
      if (previewMode) {
        if(lapisPreview){imageDemoModule.current ||= await import('../workspace/images/imageDemo');await imageDemoModule.current.initializeImageDemo(demoState.current);}
        if(videoPreview){videoDemoModule.current ||= await import('../workspace/video/videoDemo');videoDemoModule.current.initializeVideoDemo(demoState.current);}
        if(seq!==generation.current)return;
        const id = selectedEdition(demoState.current.projects.filter(item=>actor.projects.includes(item.id)),projectId,requestedScreen);
        setContext({ units: [{ id: 'gimg-demo', name: 'GIMG' }], platform_owner: actor.platformOwner === true, keynotes_access: actor.keynotesAccess === true });
        setUnitId('gimg-demo'); setProjectId(id);
        const next = viewDemo(demoState.current, actor, id);
        setRemovedEditions(demoState.current.projects.filter(item=>item.deleted_at && actor.projects.includes(item.id) && demoPermissions(actor,item.id)['project.archive']));
        next.taskReferences = demoState.current.taskReferences || {};
        setData(next); setSelectedId(current => next.tasks.some(item => item.id === current && item.project_id === id) ? current : next.tasks.find(item => item.project_id === id && taskIsMine(item, actor.id))?.id || '');
        setPermissions({...demoPermissions(actor, id, actor.area || null),'directory.unit_wide':['gimg_direction','gimg_production_lead','gimg_workspace_coordinator','gimg_quality_manager'].includes(actor.role)});
        return;
      }
      const ctx = await rpc('workspace_context');
      if (seq !== generation.current) return;
      setContext(ctx);
      const unit = ctx.units.find(item => item.id === unitId)?.id || ctx.units[0]?.id || '';
      setUnitId(unit);
      if (!unit) { setData(EMPTY); setProjectId(''); setSelectedId(''); setPermissions({}); return; }

      const results = await Promise.all(Object.entries(TABLES).map(async ([key, table]) => {
        let query = supabase.from(table).select('*').eq('unit_id', unit);
        if (key === 'projects') query = query.is('deleted_at', null);
        if (key === 'audit') query = query.order('created_at', { ascending: false }).limit(200);
        const { data: rows, error } = await query;
        if (error) throw error;
        return [key, rows || []];
      }));
      if (seq !== generation.current) return;
      const next = Object.fromEntries(results);
      const id = selectedEdition(next.projects,projectId,requestedScreen);
      const contextualTask = next.tasks.find(item => item.id === selectedId && item.project_id === id) || next.tasks.find(item => item.project_id === id);
      const area = contextualTask?.area_id || next.areas.find(item => item.project_id === id)?.id || null;
      const videoProject = next.projects.find(item => item.id === id)?.kind === 'video';
      const [unitPerm, directoryPerm, workPermissions, approvedDocuments, referenceBundle, removed, opal, support, team, images, deadlines, ultramar, video] = await Promise.all([
        rpc('workspace_permissions', { p_unit: unit }),
        rpc('workspace_permissions', { p_unit: unit, p_project: id || null, p_area: area, p_deliverable: contextualTask?.id || null }),
        id ? rpc('workspace_work_permissions', { p_project_id: id }) : { project: {}, areas: {}, tasks: {}, version_documents: {} },
        id ? rpc('workspace_edition_documents', { p_project_id: id }) : [],
        id ? rpc('workspace_reference_bundle', { p_project_id: id }) : { references: [], storage: {} },
        rpc('workspace_removed_editions', {p_unit_id:unit}),
        id ? rpc('workspace_opal_bundle', {p_project_id:id}) : {task_references:{},private_references:[],originals:[]},
        id ? rpc('workspace_support_bundle',{p_project_id:id}) : {documents:[],creation_areas:[]},
        id ? rpc('workspace_team_bundle',{p_project_id:id}) : {members:[],areas:[]},
        id ? rpc('workspace_image_bundle',{p_project_id:id}).catch(error=>{if(['PGRST202','42883'].includes(error.code))return {enabled:false};throw error;}) : {enabled:false},
        id ? rpc('workspace_deadline_facts',{p_project_id:id}) : {},
        id ? rpc('workspace_ultramar_bundle',{p_project_id:id}).catch(error=>{if(['PGRST202','42883'].includes(error.code))return {enabled:false};throw error;}) : {enabled:false},
        id && videoProject ? rpc('workspace_video_bundle',{p_project_id:id}).catch(error=>{if(['PGRST202','42883'].includes(error.code))return {enabled:false};throw error;}) : {enabled:false}
      ]);
      if (seq !== generation.current) return;
      const perm = { ...workPermissions.project, 'directory.unit_wide': Boolean(unitPerm['unit.members.read']), 'unit.members.read': Boolean(directoryPerm['unit.members.read']) };
      for (const [key, value] of Object.entries(unitPerm)) if ((key.startsWith('unit.') && key !== 'unit.members.read') || key === 'project.create') perm[key] = value;
      next.referencePermissions = workPermissions.project || {}; next.areaPermissions = workPermissions.areas || {}; next.taskPermissions = workPermissions.tasks || {}; next.approvedDocuments = approvedDocuments; next.references = referenceBundle.references; next.referenceStorage = referenceBundle.storage; next.taskReferences = opal.task_references; next.privateTaskReferences = opal.private_references; next.documentOriginals = opal.originals; next.support = support; next.team = team; next.images=images; next.video=video; next.deadlines=deadlines; next.ultramar=ultramar; next.tasks=next.tasks.map(t=>t.project_id===id?withDeadlineFacts(t,next):t);
      next.members = directoryPerm['unit.members.read'] ? await rpc('workspace_directory', { p_unit: unit, p_project: id || null, p_area: area, p_deliverable: contextualTask?.id || null }) : [];
      const ids = next.tasks.map(item => item.id);
      const contents = await Promise.all([['versions', 'workspace_versions'], ['comments', 'workspace_comments'], ['dependencies', 'workspace_dependencies']].map(async ([key, table]) => {
        if (!ids.length) return [key, []];
        let query = supabase.from(table).select('*').in('deliverable_id', ids);
        if (key !== 'dependencies') query = query.order('created_at', { ascending: false });
        const { data: rows, error } = await query;
        if (error) throw error;
        return [key, (rows || []).map(row => key === 'versions' ? { ...row, content_document: workPermissions.version_documents?.[row.id] || null, has_file: Boolean(workPermissions.version_files?.[row.id]) } : row)];
      }));
      if (seq !== generation.current) return;
      Object.assign(next, Object.fromEntries(contents));
      setData(next);setRemovedEditions(removed);
      setProjectId(id);
      setPermissions(perm);
      setSelectedId(current => next.tasks.some(item => item.id === current && item.project_id === id) ? current : next.tasks.find(item => item.project_id === id && taskIsMine(item, userId))?.id || '');
      localStorage.setItem('gba-workspace-last-visit', String(Date.now()));
    } catch (error) {
      if (seq === generation.current) { setPermissions({}); setNotice(error.message || 'No pudimos abrir Workspace. Vuelve a intentarlo.'); }
    } finally { if (seq === generation.current) setLoading(false); }
  }

  useEffect(() => { void load(); return () => { generation.current++; }; }, [userId, unitId, projectId, previewMode]);

  function navigate(action) {
    if (hasDraft) setPendingNavigation(() => action);
    else action();
  }

  function selectScreen(id) { if (id !== screen) navigate(() => { setScreen(id); if(['editions','closed'].includes(id)){const target=selectedEdition(data.projects,projectId,id);if(target!==projectId)changeProject(target);} }); }
  function selectSection(id) { if (id !== visibleSection) navigate(() => {setNotificationTarget(null);setSection(id);}); }

  function selectProject(id) {
    if (id === projectId || busy) return;
    navigate(() => changeProject(id));
  }

  function changeProject(id) {
    generation.current++;
    setLoading(true);
    setPermissions({});
    setSelectedId('');
    setSelectedSupportId('');
    setNotificationTarget(null);
    setNotice('');
    setProjectId(id);
    setSection('auto');
  }

  function selectUnit(id) {
    if (id === unitId || busy) return;
    navigate(() => changeUnit(id));
  }

  function changeUnit(id) {
    generation.current++;
    setLoading(true);
    setPermissions({});
    setData(EMPTY);
    setProjectId('');
    setSelectedId('');
    setSelectedSupportId('');
    setNotificationTarget(null);
    setNotice('');
    setUnitId(id);
    setSection('auto');
  }

  async function command(action, payload, revision = null) {
    if(action==='project.save') payload={...payload,brief:project?.brief || ''};
    if (loading || busy) return null;
    setBusy(true);
    setNotice('');
    try {
      if (previewMode) {
        const out = runWorkflowDemo(demoState.current, actor, action, { unit_id: unitId, project_id: projectId, ...payload }, revision);
        demoState.current = out.state; setData(viewDemo(out.state, actor, projectId));
        if(action==='project.save'){const group=isClosedEdition(out.result)?'closed':'editions';setScreen(group);}
        if(action!=='comment.add')setNotice(savedMessage(action,payload)+' Demostración local.');
        return out.result;
      }
      const result = await rpc('workspace_command', { p_action: action, p_data: { unit_id: unitId, project_id: projectId, ...payload }, p_revision: revision });
      const nextScreen=action==='project.save'?(isClosedEdition(result)?'closed':'editions'):screen;
      if(action==='project.save')setScreen(nextScreen);
      await load(true,nextScreen);
      // Un mensaje del chat ya se ve en la conversación; no hace falta un aviso por cada uno.
      if(action!=='comment.add')setNotice(savedMessage(action,payload));
      return result;
    } catch (error) { setNotice(error.message); return null; }
    finally { setBusy(false); }
  }

  async function workApi(action, item, payload) {
    const mutation = action !== 'draft.get';
    const quiet = payload?.quiet === true;
    if (mutation && !quiet) {setBusy(true);setNotice('');}
    try {
      if (previewMode) {
        const out = runWorkflowDemo(demoState.current, actor, action, { ...payload, project_id: item.project_id, deliverable_id: item.id }, item.revision);
        demoState.current = out.state;
        if (mutation) setData(viewDemo(out.state, actor, projectId));
        if (action === 'draft.save' && !quiet) setNotice('Borrador guardado. Tus cambios están a salvo.');
        if (action === 'draft.submit') setNotice('Documento enviado a revisión. El responsable del área ya puede revisar esta versión.');
        return out.result;
      }
      if (action === 'draft.get') return await rpc('workspace_draft', { p_deliverable_id: item.id });
      if (action === 'draft.save') { const result = await rpc('workspace_save_draft', { p_deliverable_id: item.id, p_data: payload.data, p_revision: payload.revision, p_base_version: payload.base_version }); if (!quiet) setNotice('Borrador guardado. Tus cambios están a salvo.'); return result; }
      const result = await rpc('workspace_submit_draft', { p_deliverable_id: item.id, p_draft_revision: payload.draft_revision, p_task_revision: payload.task_revision });
      await load(true); setNotice('Documento enviado a revisión. Esta versión ya está disponible para el responsable de tu área.');
      return result;
    } finally { if (mutation && !quiet) setBusy(false); }
  }
  // 1.7.5 · Ultramar: Workspace sólo prepara instantáneas; las lecturas y envíos los hace Ultramar.
  async function ultramarApi(action,item,value={},revision=null){
    if(action!=='prepare')throw Error('Acción de Ultramar no disponible en Workspace.');
    if(busy||loading)throw Error('Espera a que termine la operación actual.');
    setBusy(true);setNotice('');
    try{
      if(previewMode){
        const state=demoState.current;state.ultramar||={enabled:true,snapshots:{},versions:{}};
        const refs=Object.values(state.taskReferences?.[item.id]||{}).flat?.()||[];
        const previous=state.ultramar.snapshots[item.id];
        state.ultramar.snapshots[item.id]={version:(previous?.version||0)+1,created_at:new Date().toISOString(),textos:refs.filter(r=>r.version_id).length,recursos:refs.reduce((n,r)=>n+(r.original_ids?.length||0),0),pagina:{...value.pagina,unidad:'pt',colorModel:'RGB'}};
        setData(viewDemo(state,actor,projectId));setNotice('Asignación preparada para Ultramar. Demostración local.');return state.ultramar.snapshots[item.id];
      }
      const result=await rpc('workspace_ultramar_prepare',{p_deliverable_id:item.id,p_data:value,p_revision:revision});
      await load(true);setNotice(`Asignación preparada para Ultramar (instantánea ${result.version}).`);return result;
    }finally{setBusy(false);}
  }
  async function imageApi(action,item,value={},revision=null){
    if(previewMode){
      if(!lapisPreview||!imageDemoModule.current)throw Error('Las imágenes requieren la demostración local de Lapislázuli.');
      const result=await imageDemoModule.current.imageDemoApi(demoState.current,actor,action,item,value,revision);
      if(!['plan.get','link'].includes(action))setData(viewDemo(demoState.current,actor,projectId));
      if(action==='spec.save')setNotice('Ficha de imagen guardada.');
      if(action==='draft.save')setNotice('Borrador guardado. Nadie recibió avisos.');
      if(action==='version.submit')setNotice('Imagen enviada a revisión. Se conserva esta versión.');
      return result;
    }
    if(['upload','cancel','plan.get','link'].includes(action))return imageStorageApi(action,item,value,{actorId:userId,gateway:data.referenceStorage?.gateway_url,policy:data.images?.policy});
    const result=await rpc('workspace_image_command',{p_action:action,p_deliverable_id:item.id,p_data:value,p_revision:revision});
    if(action==='draft.save')setData(current=>({...current,images:{...current.images,drafts:{...current.images.drafts,[item.id]:result}}}));
    else await load(true);
    if(action==='spec.save')setNotice('Ficha de imagen guardada.');
    if(action==='draft.save')setNotice('Borrador guardado. Nadie recibió avisos.');
    if(action==='version.submit')setNotice('Imagen enviada a revisión. El área ya puede revisar esta versión.');
    return result;
  }
  async function videoApi(action,item,value={},revision=null){
    if(previewMode){
      if(!videoPreview||!videoDemoModule.current)throw Error('El video requiere la demostración local de Labradorita.');
      const result=await videoDemoModule.current.videoDemoApi(demoState.current,actor,action,item,value,revision);
      if(!['plan.get','link','upload','cancel'].includes(action))setData(viewDemo(demoState.current,actor,projectId));
      if(action==='upload')setData(viewDemo(demoState.current,actor,projectId));
      if(action==='version.submit')setNotice('Video enviado a revisión. Demostración local.');
      if(action==='publication.add')setNotice('Publicación registrada. Demostración local.');
      return result;
    }
    if(['upload','cancel','plan.get','link'].includes(action))return videoStorageApi(action,item,value,{actorId:userId,gateway:data.referenceStorage?.gateway_url});
    const result=await rpc('workspace_video_command',{p_action:action,p_deliverable_id:item.id,p_data:value,p_revision:revision});
    await load(true);
    if(action==='version.submit')setNotice('Video enviado a revisión. El área ya puede revisarlo.');
    if(action==='kind.set')setNotice('Tipo de entrega guardado.');
    if(action==='publication.add')setNotice('Publicación registrada.');
    return result;
  }
  async function supportApi(action, value, revision = 0) {
    action=action.replace(/^support\./,'');
    if (busy || loading) throw Error('Espera a que termine el guardado actual.');
    if (action === 'history' && !previewMode) return rpc('workspace_support_history',{p_id:value.id});
    // Background saves keep the live editor mounted and do not replace its selection.
    if(action==='save' && value.id && !previewMode) return rpc('workspace_save_support',{p_project_id:value.project_id || projectId,p_data:value,p_revision:revision});
    setBusy(true);setNotice('');
    try {
      let result;
      if(previewMode){
        const out=runWorkflowDemo(demoState.current,actor,`support.${action}`,{...value,project_id:projectId},revision);
        demoState.current=out.state;setData(viewDemo(out.state,actor,projectId));result=out.result;
      } else {
        if(action==='upload'){
          const reference=await rpc('workspace_prepare_support_original',{p_id:value.id,p_title:value.file.name.slice(0,180)});
          const uploaded=await uploadReferenceOriginal(data.referenceStorage.gateway_url,reference,value.file);
          result=await rpc('workspace_original_descriptor',{p_id:uploaded.id});
        } else result=action==='save' ? await rpc('workspace_save_support',{p_project_id:projectId,p_data:value,p_revision:revision})
          : action==='prepare' ? await rpc('workspace_prepare_support_original',{p_id:value.id,p_title:value.title})
          : await rpc('workspace_support_action',{p_id:value.id,p_action:action,p_data:value,p_revision:revision});
        if(action!=='history' && action!=='prepare')await load(true);
      }
      return result;
    } catch(error){throw error;}finally{setBusy(false);}
  }
  const inboxApi = useCallback(async(action,value)=>{
    if(previewMode)throw Error('La bandeja requiere una sesión real de GBA ID.');
    if(action==='recipients')return rpc('workspace_document_recipients',{p_id:value.id});
    if(action==='send')return rpc('workspace_send_document',{p_id:value.id,p_recipients:value.recipients,p_revision:value.revision});
    if(action==='list')return rpc('workspace_document_inbox',{p_unit:value.unitId,p_sent:value.sent,p_before:value.before || null,p_before_id:value.beforeId || null});
    if(action==='read')return rpc('workspace_read_document_delivery',{p_id:value.id});
    throw Error('Operación de documento no disponible.');
  },[previewMode]);
  async function referenceApi(action, value, revisionOrFile) {
    if (busy || loading) return null;
    setBusy(true); setNotice('');
    try {
      let result;
      if (previewMode) {
        if (['reference.upload','task.upload'].includes(action)) throw Error('La demostración local no sube archivos reales.');
        const out = runWorkflowDemo(demoState.current, actor, action, { ...value, deliverable_id:value.task?.id, project_id: projectId }, value.task?.revision ?? revisionOrFile);
        demoState.current = out.state; setData({...viewDemo(out.state, actor, projectId),taskReferences:out.state.taskReferences || {}}); result = out.result;
      } else {
        if (action === 'task.references') result = await rpc('workspace_set_task_references',{p_deliverable_id:value.task.id,p_reference_ids:value.ids,p_revision:value.task.revision,p_refresh:value.refresh || false});
        else if (action === 'task.upload') {
          const prepared = await rpc('workspace_prepare_task_reference',{p_deliverable_id:value.task.id,p_title:revisionOrFile.name.slice(0,180),p_purpose:'assignment'});
          await uploadReferenceOriginal(data.referenceStorage.gateway_url,prepared,revisionOrFile);
          result = await rpc('workspace_set_task_references',{p_deliverable_id:value.task.id,p_reference_ids:[...(data.taskReferences?.[value.task.id] || []).map(row=>row.reference_id),prepared.id],p_revision:value.task.revision});
        }
        else if (action === 'reference.upload') result = await uploadReferenceOriginal(data.referenceStorage.gateway_url, value, revisionOrFile);
        else result = await rpc(action === 'reference.archive' ? 'workspace_archive_reference' : value.from_legacy_brief ? 'workspace_import_concept' : 'workspace_save_reference', action === 'reference.archive' ? { p_id: value.id, p_revision: revisionOrFile } : { p_project_id: projectId, p_data: value, ...(!value.from_legacy_brief ? {p_revision: revisionOrFile} : {}) });
        await load(true);
      }
      setNotice(action.startsWith('task.') ? 'Materiales del encargo guardados.' : action === 'reference.archive' ? 'Referencia archivada. Se conservan sus originales e historial.' : action === 'reference.upload' ? 'Original guardado sin compresión ni cambios de calidad.' : `Referencia guardada. Ya está disponible para el equipo de esta ${productionNoun(project)}.`);
      return result;
    } catch (failure) { if(action==='task.upload' && !previewMode)await load(true);setNotice(failure.message); throw failure; }
    finally { setBusy(false); }
  }
  async function changeEditionRemoval(action, item, confirmation, reason) {
    if(busy || loading) throw Error('Espera a que termine la operación actual.');
    setBusy(true);setNotice('');
    try {
      if(previewMode){const out=runWorkflowDemo(demoState.current,actor,action,{project_id:item.id,confirmation,reason},item.revision);demoState.current=out.state;}
      else await rpc(action==='project.remove' ? 'workspace_remove_edition' : 'workspace_restore_edition',{p_project_id:item.id,p_revision:item.revision,...(action==='project.remove' ? {p_confirmation:confirmation,p_reason:reason} : {})});
      setHasDraft(false);await load(true);
      setNotice(action==='project.remove' ? 'Producción eliminada del espacio activo. Puedes restaurarla desde Configuración.' : 'Producción restaurada. El equipo vuelve a verla según sus accesos.');
    } finally{setBusy(false);}
  }
  function openNotification(resolveTarget, item) {
    navigate(()=>void (async()=>{
      const target=await resolveTarget();if(!target)return;
      const eventType=item?.event_type||target.event_type;
      if(target.delivery_id){const destination=target.project_id||projectId;if(destination!==projectId)changeProject(destination);setScreen(isClosedEdition(data.projects.find(p=>p.id===destination))?'closed':'editions');setNotificationTarget(target);setSection('work');return;}
      if(!target.project_id){setScreen('settings');return;}
      if(target.project_id!==projectId)changeProject(target.project_id);
      setScreen(isClosedEdition(data.projects.find(p=>p.id===target.project_id))?'closed':'editions');setNotificationTarget(target);
      if(target.image_version_id||target.image_note_id){setSelectedId(target.deliverable_id);const imageTask=data.tasks.find(t=>t.id===target.deliverable_id);setSection(imageTask&&taskIsMine(imageTask,userId)?'work':'reviews');return;}
      if(eventType==='mention'){setNotificationTarget({...target,id:item.id});setSection('mention');return;}
      if(target.support_id){setSelectedSupportId(target.support_id);setSection('work');return;}
      if(target.reference_id || ['document.accepted','reference.updated','publication.completed'].includes(eventType)){setSection('documents');return;}
      if(eventType==='calendar.updated'){setSection('calendar');return;}
      const t=data.tasks.find(row=>row.id===target.deliverable_id);
      setSelectedId(target.deliverable_id || '');
      setSection(t && taskIsMine(t,userId) ? 'work' : ['review.requested','qa.requested','publication.requested','publication.authorized'].includes(eventType) ? 'reviews' : 'assignments');
    })());
  }
  async function peopleCommand(action, value) {
    if(busy || loading)throw Error('Espera a que termine la operación actual.');
    setBusy(true);setNotice('');
    try{const result=await rpc('workspace_people_action',{p_unit_id:unitId,p_action:action,p_data:value});await load(true);return result;}
    finally{setBusy(false);}
  }
  function pick(item, target) {
    const scopedPermissions = data.taskPermissions?.[item.id] || {};
    const nextSection = target || (taskIsMine(item, userId) ? 'work' : canReviewTask(item, data.taskPermissions?.[item.id] || {}, data.areas.find(area => area.id === item.area_id)) || (!scopedPermissions['task.assign'] && hasReviewPermission(scopedPermissions)) ? 'reviews' : scopedPermissions['task.assign'] ? 'assignments' : 'documents');
    if (item.id === selectedId && section === nextSection && screen === 'editions') return;
    navigate(() => { if (item.project_id !== projectId) changeProject(item.project_id); setSelectedId(item.id); setSection(nextSection); setScreen(isClosedEdition(data.projects.find(p=>p.id===item.project_id))?'closed':'editions'); });
  }
  const candidateCache = useRef(new Map());
  const documentContext = {
    actorId:userId, gateway:data.referenceStorage?.gateway_url || '',
    originals:Object.fromEntries([...(data.references || []).flatMap(reference=>reference.originals || []),...(data.documentOriginals || [])].map(asset=>[asset.id,asset])),
    candidates:async scope => {
      if (previewMode) return Object.values(DEMO_ACTORS).filter(person=>person.projects.includes(projectId) && (!scope.taskId || demoPermissions(person,projectId,data.tasks.find(item=>item.id===scope.taskId)?.area_id,data.tasks.find(item=>item.id===scope.taskId))['task.read'])).map(person=>({user_id:person.id,display_name:person.name || person.label,handle:person.key}));
      const key=JSON.stringify([userId,projectId,scope]);const cached=candidateCache.current.get(key);
      if(cached && Date.now()-cached.time<30000)return cached.rows;
      const rows=scope.supportId ? await rpc('workspace_support_mention_candidates',{p_id:scope.supportId}) : await rpc('workspace_mention_candidates',{p_project_id:scope.projectId || projectId,p_deliverable_id:scope.taskId || null,p_reference_id:scope.referenceId || null,p_area_id:scope.areaId || null,p_kind:scope.kind || 'reference'});
      candidateCache.current.set(key,{time:Date.now(),rows});return rows;
    },
    // Conversación: trae los mensajes de una asignación sin recargar toda la producción.
    syncComments:async taskId=>{
      if(previewMode||!taskId)return;
      const {data:rows,error}=await supabase.from('workspace_comments').select('*').eq('deliverable_id',taskId).order('created_at',{ascending:false});
      if(error)throw error;
      setData(current=>{const before=current.comments.filter(item=>item.deliverable_id===taskId);if(sameMessages(chatMessages(before,taskId),chatMessages(rows,taskId)))return current;return {...current,comments:[...current.comments.filter(item=>item.deliverable_id!==taskId),...rows]};});
    },
    uploadImage:async(scope,file)=>{
      if(previewMode)throw Error('La demostración local conserva el flujo sin subir archivos reales.');
      if(busy || loading)throw Error('Espera a que termine la operación actual.');
      if(!originalMime(file).startsWith('image/'))throw Error('Elige una imagen original. Los PDF se añaden como material de referencia.');
      setBusy(true);
      try {
        const reference = scope.supportId ? await rpc('workspace_prepare_support_original',{p_id:scope.supportId,p_title:file.name.slice(0,180)}) : scope.taskId ? await rpc('workspace_prepare_task_reference',{p_deliverable_id:scope.taskId,p_title:file.name.slice(0,180),p_purpose:scope.kind==='assignment'?'assignment':scope.attachments?'conversation':'document_image'}) : data.references.find(row=>row.id===scope.referenceId);
        if(!reference)throw Error('Guarda esta referencia y vuelve a editarla para insertar imágenes.');
        const uploaded=await uploadReferenceOriginal(data.referenceStorage.gateway_url,reference,file);
        const asset=await rpc('workspace_original_descriptor',{p_id:uploaded.id});
        await load(true);return asset;
      } finally{setBusy(false);}
    }
  };
  const { canAssign, canReview } = editionCapabilities(data);
  const canTeam = Boolean(data.team?.areas?.length);
  const canWork = Boolean(context?.units?.length) || Boolean(data.support?.creation_areas?.length || data.support?.documents?.length) || data.tasks.some(item => item.project_id === projectId && taskIsMine(item, userId)) || Object.values(data.areaPermissions || {}).some(item => item['content.create'] || item['task.create']);
  const defaultSection = initialSection(data, projectId, userId);
  const visibleSection = section === 'auto' || section === 'assignments' && !canAssign || section === 'reviews' && !canReview ? defaultSection : section;
  const visibleProjects=editionsForScreen(data.projects,screen);
  const displayedProject=visibleProjects.some(p=>p.id===projectId)?project:null;
  const unitName = context?.units?.find(unit => unit.id === unitId)?.name || 'GBA';

  return <DocumentContext.Provider value={documentContext}><div className="gw gw-editions">
    <WorkspaceNavigation screen={screen} onScreenChange={selectScreen} context={context} unitName={unitName} name={previewMode ? actor.name : user?.nombre_publico || user?.nombre || 'GBA ID'} loading={loading || busy} onRefresh={() => navigate(() => void load())} previewMode={previewMode} blocked={Boolean(pendingNavigation)} closedCount={editionsForScreen(data.projects,'closed').length} notifications={<Notifications key={userId} actorId={userId} previewMode={previewMode} previewItems={previewMode ? demoNotifications(demoState.current,actor) : []} onOpen={openNotification} blocked={loading || busy || Boolean(pendingNavigation)}/>} />
    <main className="gw-main" aria-hidden={Boolean(pendingNavigation) || undefined}>
      {previewMode && <div className="gw-demo-flow"><span>Demostración local · prueba el flujo sin modificar datos reales.</span><label>Ver como<select value={demoActorKey} disabled={busy} onChange={event => { const next = event.target.value; if (next === demoActorKey) return; navigate(() => { setDemoActorKey(next); setSection('auto'); setSelectedId(''); setLoading(true); setData(EMPTY); setNotice(''); }); }}>{Object.entries(DEMO_ACTORS).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></label></div>}
      {screen === 'keynotes' && context?.keynotes_access ? <KeynotesWorkspace previewMode={previewMode} /> : screen === 'settings' ? <WorkspaceSettings context={context} data={data} permissions={permissions} command={command} busy={disabled || previewMode} loading={loading} unitId={unitId} projectId={projectId} onUnitChange={selectUnit} onProjectChange={selectProject} previewMode={previewMode} onNotice={setNotice} actorId={userId} peopleCommand={peopleCommand} removedEditions={removedEditions} onRemoveEdition={(...args)=>changeEditionRemoval('project.remove',...args)} onRestoreEdition={item=>changeEditionRemoval('project.restore',item)} /> : <>
        {visibleProjects.length > 0 && <EditionTabs projects={visibleProjects} selectedId={projectId} onSelect={selectProject} busy={busy} closed={screen==='closed'} />}
        {loading ? <p className="gw-loading" role="status">Abriendo producción…</p> : !context?.units?.length ? <div className="gw-empty"><h2>Tu equipo está por comenzar.</h2><p>Dirección debe incorporar tu GBA ID y asignarte permisos para una unidad. Una licencia de escritorio no concede acceso editorial.</p></div> : !displayedProject ? <div className="gw-empty"><h2>{screen==='closed'?'Todavía no hay producciones cerradas.':'No hay producciones de trabajo disponibles.'}</h2><p>{screen==='closed'?'Las producciones cerradas aparecerán aquí para consulta, según tus accesos.':'Las producciones cerradas se conservan en la sección Cerradas.'}</p>{screen!=='closed' && editionsForScreen(data.projects,'closed').length>0 && <button type="button" onClick={()=>selectScreen('closed')}>Ver producciones cerradas</button>}{permissions['project.create'] && <button type="button" onClick={() => setScreen('settings')}>Ir a Configuración</button>}</div> : <section role="tabpanel" id="workspace-edition-panel" aria-labelledby={`workspace-edition-${projectId}`} tabIndex={0}>
          {isClosedEdition(project) ? <ClosedEdition key={`${project.id}-${notificationTarget?.id||notificationTarget?.reference_id||notificationTarget?.deliverable_id||notificationTarget?.support_id||notificationTarget?.delivery_id||''}`} unitId={unitId} inboxApi={previewMode?undefined:inboxApi} project={project} data={data} actorId={userId} permissions={permissions} imageApi={imageApi} videoApi={videoApi} workApi={workApi} initialTarget={notificationTarget} initialTaskId={notificationTarget?.deliverable_id} onSettings={()=>selectScreen('settings')}/> : <>
          <EditionNavigation section={visibleSection} onSelect={selectSection} canAssign={canAssign} canReview={canReview} canWork={canWork} canTeam={canTeam} />
          {visibleSection === 'work' && <PersonalWork ultramarApi={ultramarApi} key={`${project.id}-${userId}`} initialSupportId={selectedSupportId} initialDeliveryId={notificationTarget?.delivery_id} initialAnchorId={notificationTarget?.anchor_id} initialImageNoteId={notificationTarget?.image_note_id} initialImageVersionId={notificationTarget?.image_version_id} imageApi={imageApi} videoApi={videoApi} inboxApi={previewMode ? undefined : inboxApi} unitId={unitId} supportApi={supportApi} project={project} data={data} task={task} actorId={userId} command={command} api={workApi} previewMode={previewMode} busy={disabled} onPick={item => pick(item, 'work')} onDirtyChange={setHasDraft} onReference={() => selectSection('documents')} referenceApi={referenceApi} />}
          {visibleSection === 'team' && <TeamWorkspace project={project} data={data} actorId={userId} onOpenTask={item=>pick(item,taskIsMine(item,userId)?'work':data.taskPermissions?.[item.id]?.['task.assign']?'assignments':'reviews')} onOpenDocument={item=>navigate(()=>{if(item.document_kind){setSelectedSupportId(item.id);setSection('work');}else{setNotificationTarget({reference_id:item.id});setSection('documents');}})}/>}
          {visibleSection === 'assignments' && <AreaAssignments ultramarApi={ultramarApi} imageApi={imageApi} videoApi={videoApi} project={project} data={data} task={task} command={command} busy={disabled} onPick={item => pick(item, 'assignments')} onReview={item => pick(item, 'reviews')} referenceApi={referenceApi} />}
          {visibleSection === 'reviews' && <EditionReviews imageApi={imageApi} videoApi={videoApi} initialNoteId={notificationTarget?.image_note_id} initialVersionId={notificationTarget?.image_version_id} actorId={userId} previewMode={previewMode} project={project} data={data} task={section === 'auto' ? undefined : task} command={command} busy={disabled} onPick={item => pick(item, 'reviews')} />}
          {visibleSection === 'documents' && <EditionDocuments initialTaskId={notificationTarget?.deliverable_id || selectedId} initialReferenceId={notificationTarget?.reference_id} key={`${project.id}-${notificationTarget?.reference_id || notificationTarget?.deliverable_id || selectedId}`} project={project} data={data} actorId={userId} permissions={permissions} referenceApi={referenceApi} onDirtyChange={setHasDraft} busy={disabled} onOpenTask={item => pick(item, 'work')} />}
          {visibleSection === 'mention' && <MentionDocument target={notificationTarget} previewMode={previewMode} previewState={demoState.current} onOpenCurrent={target=>{setNotificationTarget(target);const current=data.tasks.find(item=>item.id===target.deliverable_id);if(target.reference_id)setSection('documents');else if(current)pick(current);else setSection('documents');}}/>}
          {visibleSection === 'calendar' && <EditionCalendar actorId={userId} project={project} data={data} permissions={permissions} command={command} busy={disabled} onPick={pick} />}
          </>}
        </section>}
      </>}
    </main>
    <SaveNotice message={notice} onDismiss={() => setNotice('')} />
    {pendingNavigation && <DraftExitDialog onStay={() => setPendingNavigation(null)} onDiscard={() => { const next = pendingNavigation; setPendingNavigation(null); setHasDraft(false); next(); }} />}
  </div></DocumentContext.Provider>;
}
