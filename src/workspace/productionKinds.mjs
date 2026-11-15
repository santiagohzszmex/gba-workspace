// Workspace 1.8.0 Labradorita y 1.8.1: cada producción es una publicación editorial (las ediciones de siempre),
// un video o animación, o un diseño (personajes, productos, dispositivos).
export const PRODUCTION_KINDS = { publication: 'Publicación editorial', video: 'Video y animación', design: 'Diseño' };
export const productionKind = project => ['video', 'design'].includes(project?.kind) ? project.kind : 'publication';
export const isVideoProduction = project => productionKind(project) === 'video';
export const isDesignProduction = project => productionKind(project) === 'design';
// Una publicación se sigue llamando edición; las demás, producción.
export const productionNoun = project => productionKind(project) === 'publication' ? 'edición' : 'producción';
// Etiqueta corta junto al nombre de la producción en las pestañas.
export const productionTag = project => ({ video: 'Video', design: 'Diseño' })[productionKind(project)] || '';

// Equivalencias: cada persona conserva su función y Workspace la coloca en el área equivalente de cada tipo de
// producción. Es la misma tabla que usa el servidor (workspace_private.function_area); una prueba las compara.
export const FUNCTION_AREAS = {
  publication: { research: ['research', 'Investigación'], writing: ['text', 'Editorial'], editorial: ['text', 'Editorial'], layout: ['integration', 'Diseño y maquetación'], design: ['integration', 'Diseño y maquetación'], photography: ['art', 'Fotografía'], illustration: ['art', 'Ilustración'], video_editing: ['art', 'Ilustración'], animation_2d: ['art', 'Ilustración'], animation_3d: ['art', 'Ilustración'] },
  video: { research: ['script', 'Guion'], writing: ['script', 'Guion'], editorial: ['script', 'Guion'], layout: ['social', 'Publicación en redes'], design: ['social', 'Publicación en redes'], photography: ['art', 'Arte y personajes'], illustration: ['art', 'Arte y personajes'], video_editing: ['editing', 'Edición y montaje'], animation_2d: ['animation_2d', 'Animación 2D'], animation_3d: ['animation_3d', 'Animación 3D'] },
  design: { research: ['research', 'Investigación y referencias'], writing: ['concept', 'Concepto y bocetos'], editorial: ['concept', 'Concepto y bocetos'], layout: ['design', 'Diseño'], design: ['design', 'Diseño'], photography: ['presentation', 'Presentación'], illustration: ['design', 'Diseño'], video_editing: ['presentation', 'Presentación'], animation_2d: ['design', 'Diseño'], animation_3d: ['modeling_3d', 'Modelado 3D y render'] }
};
export const functionArea = (project, fn) => FUNCTION_AREAS[productionKind(project)]?.[fn] || null;
