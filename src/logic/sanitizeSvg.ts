// Copied from Horizon's src/sanitizeSvg.ts (the owner's own project; studios plan rule S7: copy, never import across
// repos). Every SVG a learner panel draws goes through it: the Explainer's step drawings now, Motion's flows next.
/**
 * Allowlist sanitiser for model-generated SVG. Keeps static shapes, text, gradients, filters and SMIL animation;
 * drops scripts, styles, foreign content, event handlers and every link that leaves the document.
 * Ids are rewritten to start with ID_TOKEN so each rendered copy can swap in its own prefix (see `instance`).
 */

const ELEMENTS = new Set([
  'g', 'defs', 'title', 'desc', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'marker',
  'filter', 'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode', 'feColorMatrix', 'feBlend', 'feFlood', 'feComposite',
  'feDropShadow', 'feMorphology', 'feTurbulence', 'feDisplacementMap',
  'animate', 'animateTransform', 'animateMotion', 'mpath', 'set'
]);

const ANIMATION = new Set(['animate', 'animateTransform', 'animateMotion', 'set']);
/** Attributes an animation may not target: changing them could turn a safe element into a link or handler. */
const FORBIDDEN_TARGETS = /^(href|xlink:href|style|class|on\w*)$/i;
const ID_TOKEN = '__hzid__';

const LINK_ATTRS = new Set(['href', 'xlink:href']);

/** CSS that can load something without a plain `url(`: image functions, and escapes that spell `url(` in disguise. */
const LOADS = /\\|image-set\s*\(|(^|[^\w-])image\s*\(|cross-fade\s*\(|element\s*\(/i;

function cleanStyle(s: string) {
  // Only same-document url(#id) references survive; everything that could load or execute is removed.
  // A declaration using a CSS escape or an image function is dropped whole.
  return s.split(';').filter(d => !LOADS.test(d)).join(';')
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none')
    .replace(/expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:/gi, '');
}

function walk(src: Element, out: Document, ids: Set<string>): Element | null {
  const name = src.localName;
  if (!ELEMENTS.has(name)) return null;
  // Attribute names are compared in lower case: when the markup is put into the page, the HTML parser
  // lower-cases them (HREF → href, attributename → attributeName), so every spelling must be caught here.
  if (ANIMATION.has(name) && [...src.attributes].some(a => a.name.toLowerCase() === 'attributename' && FORBIDDEN_TARGETS.test(a.value.trim()))) return null;
  const el = out.createElementNS('http://www.w3.org/2000/svg', name);
  for (const a of [...src.attributes]) {
    const n = a.name, low = n.toLowerCase(), v = a.value;
    if (/^on/i.test(n) || /^(xmlns|xml:base)/i.test(n) || low === 'class') continue;
    if (/javascript:|data:|vbscript:/i.test(v)) continue;
    if (LINK_ATTRS.has(low)) { if (/^#[\w-]+$/.test(v)) el.setAttribute('href', v); continue; }
    if (low === 'style') { el.setAttribute('style', cleanStyle(v)); continue; }
    if (LOADS.test(v)) continue;
    if (/url\(/i.test(v) && !/^url\(\s*['"]?#[\w-]+['"]?\s*\)$/i.test(v.trim())) continue;
    if (low === 'id') ids.add(v);
    el.setAttribute(n, v);
  }
  for (const child of [...src.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) el.appendChild(out.createTextNode(child.textContent || ''));
    else if (child.nodeType === Node.ELEMENT_NODE) { const c = walk(child as Element, out, ids); if (c) el.appendChild(c); }
  }
  return el;
}

/**
 * Namespaces every id and every reference to it: href="#id", url(#id) in attributes and styles, and SMIL timing
 * like "id.end+0.2s". Works on attributes only, so text that mentions "#id" and colours like "#ace" stay as they are.
 */
function namespace(root: Element, ids: Set<string>) {
  if (!ids.size) return;
  const to = (id: string) => `${ID_TOKEN}-${id}`;
  for (const el of root.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const v = a.value;
      let w: string;
      if (a.name === 'id') w = ids.has(v) ? to(v) : v;
      else if (a.name === 'href') w = v.startsWith('#') && ids.has(v.slice(1)) ? '#' + to(v.slice(1)) : v;
      else if (a.name === 'begin' || a.name === 'end') w = v.split(';').map(part => {
        // A timing entry like " c+d.end+0.2s" refers to the longest id it starts with, followed by a dot.
        const lead = part.match(/^\s*/)![0], rest = part.slice(lead.length);
        const id = [...ids].filter(i => rest.startsWith(i + '.')).sort((x, y) => y.length - x.length)[0];
        return id ? lead + to(id) + rest.slice(id.length) : part;
      }).join(';');
      else w = v.replace(/(url\(\s*['"]?#)([\w-]+)(?=['"]?\s*\))/g, (m, pre, id) => ids.has(id) ? pre + to(id) : m);
      if (w !== v) el.setAttribute(a.name, w);
    }
  }
}

const cache = new Map<string, string>();

/** Returns the sanitised inner markup of an <svg> string (children only), or '' if it can't be parsed. */
export function sanitizeSvg(svg: string): string {
  const hit = cache.get(svg);
  if (hit !== undefined) return hit;
  let result = '';
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root && root.localName === 'svg' && !doc.querySelector('parsererror')) {
    const out = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
    const ids = new Set<string>(), holder = out.documentElement;
    for (const child of [...root.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) { const c = walk(child as Element, out, ids); if (c) holder.appendChild(c); }
    }
    namespace(holder, ids);
    result = [...holder.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('');
  }
  if (cache.size > 200) cache.clear();
  cache.set(svg, result);
  return result;
}

/** Gives one rendered copy of a sanitised drawing its own id namespace, so copies on the same page don't collide. */
export function instance(markup: string, prefix: string) {
  return markup.split(ID_TOKEN).join(prefix);
}
