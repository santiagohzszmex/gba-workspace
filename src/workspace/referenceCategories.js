const groups = [
  {
    id: 'general', label: 'Generales', values: [
      ['concept', 'Concepto'],
      ['creative_direction', 'Dirección creativa'],
      ['moodboard', 'Moodboard'],
      ['common_palette', 'Paleta común'],
      ['edition_guide', 'Guía general'],
    ],
  },
  {
    id: 'research', label: 'Investigación', values: [
      ['research_sources', 'Fuentes de investigación'],
      ['research_methodology', 'Metodología de investigación'],
      ['interview_guide', 'Guía de entrevista'],
      ['research_context', 'Contexto de investigación'],
    ],
  },
  {
    id: 'text', label: 'Redacción y editorial', values: [
      ['editorial_style', 'Estilo editorial'],
      ['editorial_structure', 'Estructura editorial'],
      ['editorial_vocabulary', 'Vocabulario editorial'],
      ['fact_checking', 'Verificación de datos'],
    ],
  },
  {
    id: 'illustration', label: 'Ilustración', values: [
      ['illustration_characters', 'Personajes'],
      ['illustration_composition', 'Composición'],
      ['illustration_palette', 'Paleta de ilustración'],
      ['illustration_style', 'Estilo de ilustración'],
    ],
  },
  {
    id: 'photo', label: 'Fotografía', values: [
      ['photo_shot_list', 'Lista de tomas'],
      ['photo_lighting', 'Iluminación fotográfica'],
      ['photo_documentation', 'Documentación fotográfica'],
      ['photo_credits', 'Créditos fotográficos'],
    ],
  },
  {
    id: 'design', label: 'Diseño', values: [
      ['design_grid', 'Retícula'],
      ['design_typography', 'Tipografía'],
      ['design_hierarchy', 'Jerarquía visual'],
      ['design_exports', 'Exportaciones'],
    ],
  },
  {
    id: 'qa', label: 'Calidad', values: [
      ['qa_checklist', 'Lista de control de calidad'],
      ['qa_technical', 'Revisión técnica'],
    ],
  },
  {
    id: 'production', label: 'Producción', values: [
      ['production_naming', 'Nomenclatura de archivos'],
      ['production_delivery', 'Entrega de producción'],
    ],
  },
];

export const REFERENCE_CATEGORY_GROUPS = groups;
export const REFERENCE_CATEGORIES = Object.fromEntries(groups.flatMap(group => group.values));
export const GENERAL_REFERENCE_CATEGORIES = groups[0].values.map(([value]) => value);

const aliases = {
  research: 'research', investigation: 'research', investigacion: 'research',
  text: 'text', writing: 'text', editorial: 'text', redaccion: 'text',
  illustration: 'illustration', art: 'illustration', ilustracion: 'illustration',
  photo: 'photo', photography: 'photo', fotografia: 'photo',
  design: 'design', integration: 'design', layout: 'design', maquetacion: 'design',
  qa: 'qa', quality: 'qa', calidad: 'qa',
  production: 'production', produccion: 'production',
};

function token(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function asSpecialty(value) {
  const normalized = token(value);
  return aliases[normalized] || null;
}

/** Detects the area discipline from structured specialty/function fields only. */
export function referenceAreaSpecialty(area) {
  return asSpecialty(area?.specialty);
}

export function referenceCategoryLabel(category) {
  return REFERENCE_CATEGORIES[category] || '';
}

/** General categories remain available at the existing reference scope. Area categories
 * are offered only for instructions addressed to an area of the matching specialty. */
export function referenceCategoryGroups({ kind, area, assignments = [], projectId, allowAll = false, now = Date.now() }) {
  const result = [groups[0]];
  if (kind !== 'instructions') return result;
  if (!area) return allowAll ? groups : result;
  const applicable = new Set([referenceAreaSpecialty(area)]);
  for (const assignment of assignments) {
    if (assignment.area_id !== area.id || (projectId && assignment.project_id !== projectId)) continue;
    const startsAt = assignment.starts_at ? new Date(assignment.starts_at).getTime() : null;
    const expiresAt = assignment.expires_at ? new Date(assignment.expires_at).getTime() : null;
    if (startsAt !== null && (!Number.isFinite(startsAt) || startsAt > now)) continue;
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now)) continue;
    applicable.add(asSpecialty(assignment.assignment_role));
  }
  return [...result, ...groups.filter(group => applicable.has(group.id))];
}
