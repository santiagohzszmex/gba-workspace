// Workspace 1.8.0 Labradorita · Pegado limpio desde Word, Google Docs, Pages y otros editores.
// Conserva la estructura y el formato con significado (títulos, negritas, cursivas, subrayado, tachado, listas, enlaces,
// tablas y alineación) y quita lo que trae cada programa (fuentes, tamaños, colores, márgenes, estilos internos).
// Las imágenes no se copian: llegan como enlaces a archivos del otro programa; se añaden con el botón Imágenes.

import { micromark } from 'micromark';

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 'PRE']);
const DROP = new Set(['STYLE', 'SCRIPT', 'META', 'LINK', 'TITLE', 'XML', 'IMG', 'PICTURE', 'SVG', 'OBJECT', 'IFRAME', 'EMBED', 'VIDEO', 'AUDIO', 'CANVAS', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'FORM', 'NOSCRIPT', 'TEMPLATE', 'HEAD']);
const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'STRONG', 'EM', 'U', 'S', 'A', 'BR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'CODE', 'PRE', 'HR']);
const ALIGN = new Set(['center', 'right', 'justify']);

export function detectSource(html = '') {
  if (/urn:schemas-microsoft-com:office|class="?Mso|mso-/i.test(html)) return 'word';
  if (/docs-internal-guid/i.test(html)) return 'google';
  if (/Cocoa HTML Writer|Apple-converted-space|class="?[ps]\d+"?/i.test(html)) return 'apple';
  if (/LibreOffice|OpenOffice/i.test(html)) return 'libreoffice';
  return 'web';
}

function declarations(text = '') {
  const out = {};
  for (const part of String(text).split(';')) {
    const at = part.indexOf(':'); if (at < 0) continue;
    const key = part.slice(0, at).trim().toLowerCase(), value = part.slice(at + 1).trim().toLowerCase();
    if (key) out[key] = value;
  }
  return out;
}

// Estilos por clase de <style> (Pages, TextEdit, Word): «p.p1 {…}», «.MsoTitle {…}».
function classStyles(document) {
  const map = new Map();
  for (const style of document.querySelectorAll('style')) {
    const css = (style.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--|-->/g, '');
    for (const [, selectors, body] of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      for (const selector of selectors.split(',')) {
        const match = selector.trim().match(/^(?:[a-z0-9]+)?\.([\w-]+)$/i);
        if (match) map.set(match[1], { ...(map.get(match[1]) || {}), ...declarations(body) });
      }
    }
  }
  return map;
}

function styleOf(element, classes) {
  let style = {};
  for (const name of (element.getAttribute?.('class') || '').split(/\s+/)) if (classes.has(name)) style = { ...style, ...classes.get(name) };
  return { ...style, ...declarations(element.getAttribute?.('style') || '') };
}

function fontSize(style) {
  const value = style['font-size'] || (style.font || '').match(/(\d+(?:\.\d+)?)(px|pt)/)?.[0];
  const match = String(value || '').match(/(\d+(?:\.\d+)?)(px|pt)/);
  if (!match) return null;
  return match[2] === 'pt' ? Number(match[1]) * 4 / 3 : Number(match[1]);
}

function marks(element, style) {
  const tag = element.tagName, weight = style['font-weight'] || '', font = style.font || '';
  const decoration = `${style['text-decoration'] || ''} ${style['text-decoration-line'] || ''}`;
  const boldTag = tag === 'B' || tag === 'STRONG';
  const bold = (boldTag && !/^(normal|[1-5]00)$/.test(weight)) || /^(bold|bolder|[6-9]00)$/.test(weight) || /\bbold\b/.test(font);
  const italic = tag === 'I' || tag === 'EM' || style['font-style'] === 'italic' || /\bitalic\b/.test(font);
  const underline = tag === 'U' || /underline/.test(decoration);
  const strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(decoration);
  return [bold && 'strong', italic && 'em', underline && 'u', strike && 's'].filter(Boolean);
}

function wrapChildren(document, element, tags) {
  if (!tags.length) return;
  let inner = document.createElement(tags.at(-1));
  while (element.firstChild) inner.appendChild(element.firstChild);
  for (const tag of tags.slice(0, -1).reverse()) { const outer = document.createElement(tag); outer.appendChild(inner); inner = outer; }
  element.appendChild(inner);
}

function unwrap(element) { const parent = element.parentNode; if (!parent) return; while (element.firstChild) parent.insertBefore(element.firstChild, element); parent.removeChild(element); }
function rename(document, element, tag) {
  const next = document.createElement(tag);
  while (element.firstChild) next.appendChild(element.firstChild);
  element.parentNode.replaceChild(next, element); return next;
}
const textOf = node => (node.textContent || '').replace(/ /g, ' ').trim();
const elements = root => [...root.querySelectorAll('*')];

// Listas de Word: párrafos con «mso-list:l1 level2» y una viñeta escrita a mano dentro de un span «mso-list:Ignore».
function wordLists(document, classes) {
  const paragraphs = elements(document.body).filter(element => element.tagName === 'P' && /\bl\d+\b/.test(styleOf(element, classes)['mso-list'] || ''));
  const done = new Set();
  for (const first of paragraphs) {
    if (done.has(first)) continue;
    const run = [first];
    let next = first.nextElementSibling;
    const listId = p => (styleOf(p, classes)['mso-list'] || '').match(/\bl(\d+)\b/)?.[1];
    while (next && paragraphs.includes(next) && listId(next) === listId(first)) { run.push(next); next = next.nextElementSibling; }
    const stack = [];
    let root = null;
    for (const p of run) {
      done.add(p);
      const level = Number(styleOf(p, classes)['mso-list'].match(/level(\d+)/)?.[1] || 1);
      const marker = [...p.querySelectorAll('span')].find(span => /mso-list:\s*ignore/i.test(span.getAttribute('style') || '')) || null;
      const label = textOf(marker || { textContent: '' });
      const ordered = /^\(?([0-9]+|[a-z]|[ivxlc]+)[.)]/i.test(label);
      if (marker) marker.remove();
      while (stack.length > level) stack.pop();
      while (stack.length < level) {
        const list = document.createElement(ordered ? 'ol' : 'ul');
        if (stack.length) { const parentItem = stack.at(-1).lastElementChild || stack.at(-1).appendChild(document.createElement('li')); parentItem.appendChild(list); }
        else root = list;
        stack.push(list);
      }
      const item = document.createElement('li');
      while (p.firstChild) item.appendChild(p.firstChild);
      stack.at(-1).appendChild(item);
    }
    first.parentNode.insertBefore(root, first);
    for (const p of run) p.remove();
  }
}

// Listas de Google Docs: planas, con «aria-level» por elemento. Se anidan bajo el elemento anterior del nivel de arriba.
function nestByAriaLevel(document) {
  for (const list of elements(document.body).filter(element => /^(UL|OL)$/.test(element.tagName) && [...element.children].some(li => Number(li.getAttribute('aria-level') || 1) > 1))) {
    const stack = [{ list, last: null }];
    for (const item of [...list.children]) {
      const level = Math.max(1, Number(item.getAttribute('aria-level') || 1));
      while (stack.length > level) stack.pop();
      while (stack.length < level && stack.at(-1).last) {
        const nested = document.createElement(list.tagName.toLowerCase());
        stack.at(-1).last.appendChild(nested); stack.push({ list: nested, last: null });
      }
      stack.at(-1).list.appendChild(item); stack.at(-1).last = item;
    }
  }
}

// Pages y Google Docs marcan títulos por tamaño de letra. Se compara con el tamaño más usado en el texto.
function headingsBySize(document, classes) {
  const blocks = elements(document.body).filter(element => element.tagName === 'P');
  const sizeOf = element => Math.max(fontSize(styleOf(element, classes)) || 0, ...[...element.querySelectorAll('span,font')].map(span => fontSize(styleOf(span, classes)) || 0));
  const weights = new Map();
  for (const block of blocks) { const size = Math.round(sizeOf(block)); if (size) weights.set(size, (weights.get(size) || 0) + textOf(block).length); }
  const base = [...weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!base) return;
  for (const block of blocks) {
    const text = textOf(block), size = sizeOf(block);
    if (!text || text.length > 160 || !size || block.closest('li,td,th')) continue;
    const allBold = [...block.querySelectorAll('b,strong,span')].some(element => marks(element, styleOf(element, classes)).includes('strong') && textOf(element) === text);
    const level = size >= base * 1.6 ? 1 : size >= base * 1.25 ? 2 : size >= base * 1.1 && allBold ? 3 : 0;
    if (level) block.setAttribute('data-heading', String(level));
  }
}

export function cleanPastedHtml(html, { DOMParser = globalThis.DOMParser } = {}) {
  const source = detectSource(html);
  // Fragmentos sin <body> (Google Docs, navegadores): se envuelven para leerlos igual en cualquier analizador.
  const markup = /<body[\s>]/i.test(String(html || '')) ? String(html) : `<!DOCTYPE html><html><head></head><body>${html || ''}</body></html>`;
  const document = new DOMParser().parseFromString(markup, 'text/html');
  const body = document.body;
  if (!body) return { html: '', source, removedImages: 0 };
  const classes = classStyles(document);
  const hadWordTitle = source === 'word' && Boolean(body.querySelector('.MsoTitle'));
  const removedImages = body.querySelectorAll('img,picture,svg,v\\:imagedata,v\\:shape').length;

  // Comentarios (incluidos los condicionales de Word) y etiquetas de Office (o:p, w:*, v:*).
  const walker = document.createTreeWalker(body, 128);
  const comments = []; while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach(comment => comment.remove());
  for (const element of elements(body)) if (element.tagName.includes(':')) { if (/^O:P$/i.test(element.tagName)) element.remove(); else unwrap(element); }

  // Google Docs envuelve todo en <b style="font-weight:normal" id="docs-internal-guid-…">: no es negrita.
  for (const element of elements(body)) if (/^(B|STRONG)$/.test(element.tagName) && /^(normal|[1-5]00)$/.test(styleOf(element, classes)['font-weight'] || '')) unwrap(element);

  if (source === 'word') wordLists(document, classes);
  nestByAriaLevel(document);
  if (source === 'apple' || source === 'google' || source === 'libreoffice') headingsBySize(document, classes);

  // Formato con significado: de estilos y etiquetas a <strong>, <em>, <u> y <s>.
  for (const element of elements(body).reverse()) {
    if (DROP.has(element.tagName)) { element.remove(); continue; }
    const style = styleOf(element, classes);
    const found = /^(H[1-6])$/.test(element.tagName) ? marks(element, style).filter(tag => tag !== 'strong') : marks(element, style);
    const align = style['text-align'];
    const heading = element.getAttribute('data-heading') || (source === 'word' && /\bMsoTitle\b/.test(element.getAttribute('class') || '') ? '1' : source === 'word' && /\bMsoSubtitle\b/.test(element.getAttribute('class') || '') ? '2' : null);
    let target = element;
    if (/^(B|STRONG|I|EM|U|S|STRIKE|DEL|SPAN|FONT|SUP|SUB|INS|MARK|SMALL|BIG|CITE|ABBR|LABEL)$/.test(element.tagName)) {
      // Dentro de un enlace el subrayado es del propio enlace.
      const tags = found.filter(tag => !element.parentElement?.closest(tag) && !(tag === 'u' && element.closest('a')));
      wrapChildren(document, element, tags); unwrap(element); continue;
    }
    if (heading) { target = rename(document, element, `h${heading}`); if (source === 'word' && heading === '1') target.setAttribute('data-title', ''); }
    else if (/^H[4-6]$/.test(element.tagName)) target = rename(document, element, 'h3');
    else if (element.tagName === 'DIV') target = [...element.children].some(child => BLOCKS.has(child.tagName) || /^(UL|OL|TABLE)$/.test(child.tagName)) ? (unwrap(element), null) : rename(document, element, 'p');
    if (!target) continue;
    if (/^(P|H1|H2|H3|LI|TD|TH)$/.test(target.tagName)) {
      const tags = /^H/.test(target.tagName) ? found.filter(tag => tag !== 'strong') : found;
      wrapChildren(document, target, tags);
      if (ALIGN.has(align)) target.setAttribute('data-align', align);
    }
  }

  // Atributos: sólo enlaces seguros, combinaciones de celdas y alineación.
  for (const element of elements(body)) {
    if (!KEEP.has(element.tagName)) { if (element.tagName === 'DIV') rename(document, element, 'p'); else unwrap(element); continue; }
    const href = element.tagName === 'A' ? element.getAttribute('href') || '' : '';
    const span = { colspan: element.getAttribute('colspan'), rowspan: element.getAttribute('rowspan') }, align = element.getAttribute('data-align');
    const title = element.hasAttribute('data-title');
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (title) element.setAttribute('data-title', '');
    if (element.tagName === 'A') { if (/^(https?:|mailto:)/i.test(href.trim())) element.setAttribute('href', href.trim()); else { unwrap(element); continue; } }
    if (/^(TD|TH)$/.test(element.tagName)) for (const [name, value] of Object.entries(span)) if (/^\d+$/.test(value || '') && value !== '1') element.setAttribute(name, value);
    if (align) element.setAttribute('style', `text-align: ${align}`);
  }

  // Espacios duros de Word y párrafos vacíos que sólo separaban.
  const texts = document.createTreeWalker(body, 4); const nodes = []; while (texts.nextNode()) nodes.push(texts.currentNode);
  for (const node of nodes) node.textContent = node.textContent.replace(/ /g, ' ');
  // Saltos sueltos entre bloques (Google Docs, Safari).
  for (const node of [...body.childNodes]) if (node.nodeName === 'BR') node.remove();
  for (const element of [...body.querySelectorAll('p,h1,h2,h3')]) {
    while (element.lastChild?.nodeName === 'BR') element.lastChild.remove();
    if (!textOf(element) && !element.querySelector('br,hr')) element.remove();
  }
  for (const element of [...body.querySelectorAll('strong,em,u,s')]) if (!element.textContent) element.remove();
  // Los títulos ya son negritas.
  for (const element of [...body.querySelectorAll('h1 strong,h2 strong,h3 strong')]) unwrap(element);
  // Word: si hay «Título», los «Título 1» y «Título 2» bajan un nivel para no competir con él.
  if (source === 'word' && hadWordTitle) for (const element of [...body.querySelectorAll('h1,h2')].filter(element => !element.hasAttribute('data-title'))) rename(document, element, element.tagName === 'H1' ? 'h2' : 'h3');
  for (const element of body.querySelectorAll('[data-title]')) element.removeAttribute('data-title');

  return { html: body.innerHTML.replace(/\n\s*/g, ' ').trim(), source, removedImages };
}

// Texto plano con forma de Markdown (copiado de ChatGPT, notas, VS Code…).
export function looksLikeMarkdown(text = '') {
  const value = String(text);
  if (value.length < 3 || value.length > 200000) return false;
  const lines = value.split(/\r?\n/);
  const block = lines.some(line => /^\s{0,3}(#{1,6}\s+\S|[-*+]\s+\S|\d+[.)]\s+\S|>\s?\S|```|---\s*$|\|.+\|)/.test(line));
  const inline = /\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|`[^`\n]+`/.test(value);
  return block || inline;
}

// Markdown a HTML (CommonMark, sin HTML incrustado) y ~~tachado~~. Después pasa por la misma limpieza del pegado.
export function markdownToHtml(text = '') {
  return micromark(String(text).replace(/\r\n?/g, '\n')).replace(/~~([^~<>\n]+)~~/g, '<s>$1</s>');
}
