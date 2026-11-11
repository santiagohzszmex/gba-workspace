// Workspace 1.8.0 Labradorita: cada producción es una publicación editorial (las ediciones de siempre) o de video.
export const PRODUCTION_KINDS = { publication: 'Publicación editorial', video: 'Video y animación' };
export const productionKind = project => project?.kind === 'video' ? 'video' : 'publication';
export const isVideoProduction = project => productionKind(project) === 'video';
// Una publicación se sigue llamando edición; las demás, producción.
export const productionNoun = project => isVideoProduction(project) ? 'producción' : 'edición';
