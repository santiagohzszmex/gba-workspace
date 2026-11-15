export const ACCESS_ROLES = {
  "gba_platform_owner": {
    "name": "Administración técnica de GBA",
    "short": "Plataforma GBA",
    "tone": "gray"
  },
  "gimg_direction": {
    "name": "Dirección de GIMG",
    "short": "Dirección",
    "tone": "indigo"
  },
  "gimg_production_lead": {
    "name": "Responsable de Producción",
    "short": "Producción",
    "tone": "teal"
  },
  "gimg_workspace_coordinator": {
    "name": "Coordinación de Producción y Workspace",
    "short": "Coord. Workspace",
    "tone": "teal"
  },
  "gimg_project_director": {
    "name": "Dirección de producción delegada",
    "short": "Dir. de producción",
    "tone": "amber"
  },
  "gimg_area_lead": {
    "name": "Responsable de área",
    "short": "Resp. de área",
    "tone": "blue"
  },
  "gimg_contributor": {
    "name": "Colaborador",
    "short": "Colaborador",
    "tone": "gray"
  },
  "gimg_quality_manager": {
    "name": "Gestión de archivos y QA",
    "short": "QA",
    "tone": "purple"
  },
  "gimg_viewer": {
    "name": "Consulta",
    "short": "Consulta",
    "tone": "neutral"
  }
};

export const FUNCTIONS = {
  "direction": "Dirección",
  "production": "Producción",
  "research": "Investigación",
  "writing": "Redacción",
  "editorial": "Editorial",
  "layout": "Maquetación",
  "design": "Diseño",
  "illustration": "Ilustración",
  "photography": "Fotografía",
  "video_editing": "Edición de video",
  "animation_2d": "Animación 2D",
  "animation_3d": "Animación 3D",
  "qa": "QA"
};

export const CARGOS = [
  {
    "key": "direction",
    "title": "Dirección general y creativa",
    "accessRole": "gimg_direction",
    "assignmentRole": "direction",
    "scope": "unit",
    "scopeText": "Toda la unidad GIMG",
    "expiry": "none",
    "notice": "Este cargo no vence y da la aprobación final. Confirma que sea la persona correcta."
  },
  {
    "key": "production",
    "title": "Responsable de Producción",
    "accessRole": "gimg_production_lead",
    "assignmentRole": "production",
    "scope": "unit",
    "scopeText": "Toda la unidad GIMG durante el ciclo activo",
    "expiry": "optional"
  },
  {
    "key": "coordination",
    "title": "Coordinación de Producción y Workspace",
    "accessRole": "gimg_workspace_coordinator",
    "assignmentRole": "production",
    "scope": "unit",
    "scopeText": "Toda la unidad GIMG durante el ciclo activo",
    "expiry": "optional",
    "notice": "Sólo puede apoyar altas que Dirección ya autorizó, mediante delegación.",
    "needsProject": true
  },
  {
    "key": "project_director",
    "title": "Dirección de producción",
    "accessRole": "gimg_project_director",
    "assignmentRole": "direction",
    "scope": "project",
    "expiry": "required",
    "notice": "Exige vencimiento y sólo recibe los permisos que se le deleguen por escrito."
  },
  {
    "key": "area_lead",
    "title": "Responsable de área",
    "accessRole": "gimg_area_lead",
    "scope": "area",
    "expiry": "optional",
    "functions": [
      "research",
      "writing",
      "editorial",
      "layout",
      "design",
      "illustration",
      "photography",
      "video_editing",
      "animation_2d",
      "animation_3d"
    ],
    "defaultFunction": "illustration",
    "functionLabel": "Área que coordina"
  },
  {
    "key": "contributor",
    "title": "Integrante de un área",
    "accessRole": "gimg_contributor",
    "scope": "area",
    "expiry": "optional",
    "functions": [
      "research",
      "writing",
      "editorial",
      "layout",
      "design",
      "illustration",
      "photography",
      "video_editing",
      "animation_2d",
      "animation_3d"
    ],
    "defaultFunction": "illustration",
    "functionLabel": "Función"
  },
  {
    "key": "quality",
    "title": "Gestión de archivos y QA",
    "accessRole": "gimg_quality_manager",
    "assignmentRole": "qa",
    "scope": "unit",
    "scopeText": "Proyectos activos de GIMG",
    "expiry": "optional",
    "needsProject": true
  },
  {
    "key": "viewer",
    "title": "Consulta",
    "accessRole": "gimg_viewer",
    "assignmentRole": null,
    "scope": "project",
    "expiry": "required",
    "notice": "Consulta permite leer sólo los recursos compartidos expresamente, sin modificar ni aprobar trabajos."
  }
];
