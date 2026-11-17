// Copied from Horizon's src/sanitizeSvg.ts (the owner's own project; studios plan rule S7: copy, never import across
// repos). Every SVG a learner panel draws goes through it: the Explainer's step drawings now, Motion's flows next.
// Hardened here after a security review (Task 2.2), so it differs from Horizon's: the attribute names id, href, begin and
// end are written in lower case and compared in lower case everywhere, every id is prefixed, and a reference (#id href,
// url(#id), SMIL begin/end) to an id the drawing does not define is dropped, so it can never reach the rest of the page.
// After the fix round: attributes are judged by their local name (lower case) and kept only without a namespace (but
// xlink:href); animations may not target href, style, class or any on... name however it is spelt; title and desc keep
// text only (they are HTML integration points, so an element inside them would re-parse as HTML); a CSS declaration with
// a forbidden token is dropped whole; and every url() goes through the one rule (URL_ID / strayUrl).
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
/** Attributes an animation may not target: changing them could turn a safe element into a link or handler. Judged on the
 * target without whitespace, prefix or case, so " on&#x09;click", "a:href" and "HREF" are all caught. */
const forbiddenTarget = (v: string) => { const t = v.replace(/\s/g, '').toLowerCase().split(':').pop() || ''; return /^(href|style|class)$/.test(t) || t.startsWith('on'); };
const XLINK = 'http://www.w3.org/1999/xlink';
/** title and desc are HTML integration points: an element inside them would be parsed as HTML when rendered. */
const TEXT_ONLY = new Set(['title', 'desc']);
const ID_TOKEN = '__hzid__';

const LINK_ATTRS = new Set(['href', 'xlink:href']);
/** Attributes written under their lower-case name, so no other spelling can slip past the checks in `namespace`. */
const CANONICAL = new Set(['id', 'begin', 'end']);

/** CSS that can load something without a plain `url(`: image functions, and escapes that spell `url(` in disguise. */
const LOADS = /\\|image-set\s*\(|(^|[^\w-])image\s*\(|cross-fade\s*\(|element\s*\(|(^|[^\w-])src\s*\(/i;
/** CSS that runs or imports something: a declaration holding one is dropped whole (patching it could rebuild it). */
const RUNS = /expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:/i;

/** The one url() form that survives: a plain same-document reference, url(#id), quoted or not. */
const URL_ID = /url\(\s*(['"]?)#([\w-]+)\1\s*\)/gi;
/** Whether a value has a url( other than the plain url(#id) form (unclosed, escaped, external, odd whitespace...). */
const strayUrl = (v: string) => /url\(/i.test(v.replace(URL_ID, ''));

function cleanStyle(s: string) {
  // Only same-document url(#id) references survive; everything that could load or execute is removed.
  // A declaration using a CSS escape, an image function or any other url() is dropped whole.
  return s.split(';').filter(d => !LOADS.test(d) && !RUNS.test(d) && !strayUrl(d)).join(';');
}

function walk(src: Element, out: Document, ids: Set<string>): Element | null {
  const name = src.localName;
  if (!ELEMENTS.has(name)) return null;
  // Attribute names are compared in lower case: when the markup is put into the page, the HTML parser
  // lower-cases them (HREF → href, attributename → attributeName), so every spelling must be caught here.
  // Only attributes without a namespace count (xlink:href aside); a prefixed one is dropped, so no spelling of a name
  // in another namespace reaches the checks below.
  const attrs = [...src.attributes].filter(a => !a.namespaceURI || (a.namespaceURI === XLINK && a.localName.toLowerCase() === 'href'));
  const target = attrs.find(a => a.localName.toLowerCase() === 'attributename');
  // An animation that names no plain target (animateMotion needs none) does nothing; one with a forbidden target goes.
  if (ANIMATION.has(name) && (target ? forbiddenTarget(target.value) : name !== 'animateMotion')) return null;
  const el = out.createElementNS('http://www.w3.org/2000/svg', name);
  for (const a of attrs) {
    const low = a.localName.toLowerCase().trim(), v = a.value;
    if (low.startsWith('on') || low === 'xmlns' || low === 'class') continue;
    if (/javascript:|data:|vbscript:/i.test(v)) continue;
    if (LINK_ATTRS.has(low)) { if (/^#[\w-]+$/.test(v)) el.setAttribute('href', v); continue; }
    if (low === 'style') { el.setAttribute('style', cleanStyle(v)); continue; }
    if (LOADS.test(v) || strayUrl(v)) continue;
    if (low === 'id') ids.add(v);
    el.setAttribute(CANONICAL.has(low) ? low : a.localName, v);
  }
  for (const child of [...src.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) el.appendChild(out.createTextNode(child.textContent || ''));
    else if (child.nodeType === Node.ELEMENT_NODE && !TEXT_ONLY.has(name)) { const c = walk(child as Element, out, ids); if (c) el.appendChild(c); }
  }
  return el;
}

const CLOCK = '(\\d+(\\.\\d+)?(h|min|s|ms)?|\\d+:\\d{2}(:\\d{2})?(\\.\\d+)?)';
/** A SMIL offset or clock value ("2s", "-0.5s", "1:30"), and what may follow an id: ".end", ".click+1s", ".repeat(2)". */
const OFFSET = new RegExp('^[+-]?\\s*' + CLOCK + '$');
const AFTER_ID = new RegExp('^\\.[A-Za-z][\\w-]*(\\(\\d+\\))?(\\s*[+-]\\s*' + CLOCK + ')?$');

/** A value with its url(#id) references namespaced; null when it refers to an id the drawing lacks or has another url(. */
function withIds(v: string, ids: Set<string>, to: (id: string) => string): string | null {
  if (strayUrl(v)) return null;
  let known = true;
  const w = v.replace(URL_ID, (m, _q, id) => { if (!ids.has(id)) known = false; return m.replace('#' + id, '#' + to(id)); });
  return known ? w : null;
}

/**
 * Namespaces every id and every reference to it: href="#id", url(#id) in attributes and styles, and SMIL timing
 * like "id.end+0.2s". Works on attributes only, so text that mentions "#id" and colours like "#ace" stay as they are.
 * A reference to an id the drawing does not define is dropped: the href or the timing entry goes, url() becomes none.
 */
function namespace(root: Element, ids: Set<string>) {
  const to = (id: string) => `${ID_TOKEN}-${id}`;
  for (const el of root.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase(), v = a.value;
      let w: string | null;
      if (name === 'id') w = to(v);
      else if (name === 'href') w = v.startsWith('#') && ids.has(v.slice(1)) ? '#' + to(v.slice(1)) : null;
      else if (name === 'begin' || name === 'end') w = v.split(';').flatMap(part => {
        // An allow-list: a timing entry like " c+d.end+0.2s" refers to the longest id of the drawing it starts with,
        // followed by an event or sync name and an offset; otherwise only an offset, a clock value or "indefinite" stays.
        const lead = part.match(/^\s*/)![0], rest = part.slice(lead.length).trimEnd();
        const id = [...ids].filter(i => rest.startsWith(i + '.')).sort((x, y) => y.length - x.length)[0];
        if (id) return AFTER_ID.test(rest.slice(id.length)) ? [lead + to(id) + rest.slice(id.length)] : [];
        return rest === 'indefinite' || OFFSET.test(rest) ? [part] : [];
      }).join(';') || null;
      else if (name === 'style') w = v.split(';').map(d => withIds(d, ids, to)).filter(d => d !== null).join(';') || null;
      else w = withIds(v, ids, to) ?? (/url\(/i.test(v) ? 'none' : v);
      if (w === null) el.removeAttribute(a.name);
      else if (w !== v) el.setAttribute(a.name, w);
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
