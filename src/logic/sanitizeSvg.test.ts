// @vitest-environment jsdom
// Copied from Horizon's tests/unit/sanitizeSvg.test.ts (the owner's own project; studios plan rule S7: copy, never import
// across repos). It tests this repo's copy of the allow-list sanitiser for model-made SVG, src/logic/sanitizeSvg.ts.
import { describe, expect, it } from 'vitest';
import { instance, sanitizeSvg } from './sanitizeSvg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Wraps children in an <svg> root the way a model would write it. */
const svg = (inner: string, attrs = '') =>
  `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" ${attrs}>${inner}</svg>`;

/**
 * Renders sanitised markup the way the app does (viz.tsx: dangerouslySetInnerHTML on an <svg> in an HTML page),
 * so assertions see what the browser would see after the HTML parser (which lowercases attribute names).
 */
function render(markup: string): SVGSVGElement {
  const host = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(host);
  host.innerHTML = markup;
  return host;
}

const EXECUTABLE_ELEMENTS = ['script', 'foreignObject', 'foreignobject', 'iframe', 'object', 'embed', 'a', 'image', 'style', 'link', 'meta', 'handler', 'listener'];

/** Everything that could run code or load something from outside, in the rendered DOM. */
function dangers(markup: string): string[] {
  const out: string[] = [];
  const host = render(markup);
  for (const el of host.querySelectorAll('*')) {
    if (EXECUTABLE_ELEMENTS.includes(el.localName)) out.push(`element <${el.localName}>`);
    for (const a of el.attributes) {
      const name = a.name.toLowerCase();
      // Browsers strip ASCII whitespace and control characters from URLs before reading the scheme.
      // oxlint-disable-next-line no-control-regex
      const value = a.value.replace(/[\u0000- ]/g, '').toLowerCase();
      if (name.startsWith('on')) out.push(`handler ${a.name}`);
      if (/javascript:|vbscript:|data:/.test(value)) out.push(`scheme in ${a.name}=${a.value}`);
      if ((name === 'href' || name.endsWith(':href')) && !a.value.startsWith('#')) out.push(`external ${a.name}=${a.value}`);
      if (/url\((?!\s*['"]?#)/.test(value)) out.push(`external url in ${a.name}=${a.value}`);
      if (/(^|[^a-z-])(image-set|src)\(/.test(value)) out.push(`image function in ${a.name}=${a.value}`);
      if (/\\/.test(a.value) && name === 'style' || /\\[0-9a-f]/i.test(a.value)) out.push(`css escape in ${a.name}=${a.value}`);
      if (name === 'class') out.push(`class=${a.value}`);
      if (name === 'attributename' && /^(href|xlink:href|style|class|on\w*)$/i.test(a.value.trim())) out.push(`animates ${a.value}`);
    }
  }
  host.remove();
  return out;
}

describe('sanitizeSvg: structure', () => {
  it('returns the children of the root svg, not the root itself', () => {
    const out = sanitizeSvg(svg('<rect x="1" y="2" width="3" height="4" fill="#123456"/>'));
    expect(out).not.toMatch(/<svg/);
    const host = render(out);
    const rect = host.querySelector('rect')!;
    expect(rect).not.toBeNull();
    expect(rect.namespaceURI).toBe(SVG_NS);
    expect(rect.getAttribute('fill')).toBe('#123456');
    expect(rect.getAttribute('width')).toBe('3');
  });

  it('keeps allowed shapes, gradients, filters and SMIL animation', () => {
    const out = sanitizeSvg(svg(
      '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient>' +
      '<filter id="f"><feGaussianBlur stdDeviation="2"/><feDropShadow dx="1"/></filter></defs>' +
      '<g><circle r="5"><animate attributeName="r" from="5" to="10" dur="1s"/></circle>' +
      '<path d="M0 0L10 10"/><animateTransform attributeName="transform" type="rotate"/></g>'
    ));
    for (const tag of ['defs', 'linearGradient', 'stop', 'filter', 'feGaussianBlur', 'feDropShadow', 'g', 'circle', 'animate', 'path', 'animateTransform']) {
      expect(out, tag).toContain(`<${tag} `);
    }
  });

  it('preserves text content, including characters that look like markup', () => {
    const out = sanitizeSvg(svg('<text x="0">Revenue &amp; growth &lt;script&gt;alert(1)&lt;/script&gt;<tspan>+12%</tspan></text>'));
    const host = render(out);
    expect(host.querySelector('text')!.textContent).toBe('Revenue & growth <script>alert(1)</script>+12%');
    expect(host.querySelector('script')).toBeNull();
  });

  it('drops unknown elements together with all their children', () => {
    const out = sanitizeSvg(svg('<unknown><rect id="inside"/><text>hidden</text></unknown><circle r="1"/>'));
    expect(out).not.toContain('unknown');
    expect(out).not.toContain('inside');
    expect(out).not.toContain('hidden');
    expect(out).toContain('<circle');
  });

  it('ignores comments and processing instructions at the top level and inside elements', () => {
    const out = sanitizeSvg(svg('<!-- a comment --><?pi data?><g><!-- inner --><rect/></g>'));
    expect(out).not.toContain('comment');
    expect(out).not.toContain('inner');
    expect(out).toContain('<rect');
  });

  it('returns an empty string for malformed SVG', () => {
    expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>')).toBe('');
    expect(sanitizeSvg('not markup at all')).toBe('');
    expect(sanitizeSvg('')).toBe('');
  });

  it('returns an empty string when the root is not <svg>', () => {
    expect(sanitizeSvg(`<g xmlns="${SVG_NS}"><rect/></g>`)).toBe('');
    expect(sanitizeSvg('<html><body><svg><rect/></svg></body></html>')).toBe('');
  });

  it('returns the same result for the same input (memoised) and keeps working past the cache limit', () => {
    const input = svg('<rect width="7"/>');
    const first = sanitizeSvg(input);
    expect(sanitizeSvg(input)).toBe(first);
    // Fill the cache past its 200-entry limit so it is cleared, then check results are still correct.
    for (let i = 0; i < 205; i++) expect(sanitizeSvg(svg(`<rect width="${i}"/>`))).toContain(`width="${i}"`);
    expect(sanitizeSvg(input)).toBe(first);
  });
});

describe('sanitizeSvg: dangerous content is removed', () => {
  it('removes <script> elements and their code', () => {
    const out = sanitizeSvg(svg('<script>alert(1)</script><script xlink:href="https://evil.example/x.js"/><rect/>'));
    expect(out).not.toMatch(/script|alert|evil/);
    expect(out).toContain('<rect');
  });

  it('removes namespace-prefixed scripts (<svg:script>)', () => {
    const out = sanitizeSvg(svg('<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script><rect/>'));
    expect(out).not.toMatch(/script|alert/);
  });

  it('removes <foreignObject> and the HTML inside it', () => {
    const out = sanitizeSvg(svg('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></div></foreignObject>'));
    expect(out).toBe('');
  });

  it('removes <style> elements', () => {
    const out = sanitizeSvg(svg('<style>@import url(https://evil.example/a.css); rect { fill: red }</style><rect/>'));
    expect(out).not.toMatch(/style|import|evil/);
  });

  it('removes <a>, <image>, <iframe> and other non-allowlisted elements', () => {
    const out = sanitizeSvg(svg(
      '<a href="javascript:alert(1)"><text>click</text></a><a xlink:href="https://evil.example"><rect/></a>' +
      '<image href="https://evil.example/p.png"/><image xlink:href="data:image/svg+xml,&lt;svg onload=alert(1)&gt;"/>' +
      '<iframe src="https://evil.example"/><animateColor attributeName="fill"/>'
    ));
    expect(out).toBe('');
  });

  it('drops on* event handlers in any case', () => {
    const out = sanitizeSvg(svg('<rect onclick="alert(1)" ONLOAD="alert(2)" onMouseOver="alert(3)" width="1"/>'));
    expect(out).not.toMatch(/alert|onclick|onload|onmouseover/i);
    expect(out).toContain('width="1"');
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['uppercase JAVASCRIPT:', 'JAVASCRIPT:alert(1)'],
    ['entity-encoded javascript:', '&#106;avascript:alert(1)'],
    ['hex-entity-encoded javascript:', '&#x6A;&#x61;vascript:alert(1)'],
    ['data:', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['vbscript:', 'vbscript:msgbox(1)'],
  ])('drops any attribute whose value contains %s', (_label, value) => {
    const out = sanitizeSvg(svg(`<rect fill="${value}" width="2"/><animate attributeName="fill" values="red;${value}"/>`));
    expect(out).not.toMatch(/script|data:|alert|msgbox/i);
    expect(out).toContain('width="2"');
    expect(dangers(out)).toEqual([]);
  });

  it('drops a javascript: link split by a newline or tab (browsers strip those from URLs)', () => {
    const out = sanitizeSvg(svg('<use href="java&#10;script:alert(1)"/><use xlink:href="java&#9;script:alert(1)"/>'));
    expect(out).not.toMatch(/script|alert/);
    expect(dangers(out)).toEqual([]);
  });

  it('keeps only same-document #id links and writes them as plain href', () => {
    const out = sanitizeSvg(svg(
      '<defs><path id="p" d="M0 0"/></defs>' +
      '<use xlink:href="#p"/><use href="#p"/>' +
      '<use href="https://evil.example/sprite.svg#p"/><use xlink:href="//evil.example/x.svg#p"/>' +
      '<use href="#p onload"/><use href="other.svg#p"/>'
    ));
    const host = render(out);
    const uses = [...host.querySelectorAll('use')];
    expect(uses).toHaveLength(6);
    const hrefs = uses.map(u => u.getAttribute('href'));
    expect(hrefs).toEqual(['#__hzid__-p', '#__hzid__-p', null, null, null, null]);
    expect(out).not.toContain('xlink:href');
    expect(out).not.toContain('evil');
    expect(dangers(out)).toEqual([]);
  });

  it('drops attributes that load an external url(), keeping same-document url(#id)', () => {
    const out = sanitizeSvg(svg(
      '<defs><linearGradient id="g"/></defs>' +
      '<rect fill="url(#g)" stroke="url(https://evil.example/x)" filter="url(  \'http://evil.example/f\'  )" mask="URL(//evil.example/m)" width="3"/>' +
      '<rect fill="url( \'#g\' )"/>'
    ));
    expect(out).not.toContain('evil');
    expect(out).toContain('fill="url(#__hzid__-g)"');
    expect(out).toContain('fill="url( \'#__hzid__-g\' )"');
    expect(out).toContain('width="3"');
  });

  // Hardened here (Task 2.2): a declaration with any other url() is dropped whole instead of set to none.
  it('drops a style declaration with an external url(), keeping url(#id)', () => {
    const out = sanitizeSvg(svg(
      '<defs><clipPath id="c"/></defs>' +
      '<rect style="fill: url(https://evil.example/a); clip-path: url(#c); stroke: URL( \'http://evil.example/b\' ); opacity: .5"/>'
    ));
    const style = render(out).querySelector('rect')!.getAttribute('style')!;
    expect(style).not.toContain('evil');
    expect(style).not.toMatch(/fill|stroke/);
    expect(style).toContain('url(#__hzid__-c)');
    expect(style).toContain('opacity: .5');
  });

  it('strips expression(), @import, behavior: and -moz-binding from style', () => {
    const out = sanitizeSvg(svg('<rect style="width: expression(alert(1)); @import \'x.css\'; behavior: x.htc; -moz-binding: none; fill: red"/>'));
    const style = render(out).querySelector('rect')!.getAttribute('style')!;
    expect(style).not.toMatch(/expression\s*\(|@import|behavior\s*:|-moz-binding/i);
    expect(style).toContain('fill: red');
  });

  it('drops a style attribute containing javascript: entirely', () => {
    const out = sanitizeSvg(svg('<rect style="background: javascript:alert(1)" width="4"/>'));
    expect(out).not.toMatch(/style|javascript/);
    expect(out).toContain('width="4"');
  });

  it('drops class, xmlns declarations and xml:base', () => {
    const out = sanitizeSvg(svg('<g class="modal-overlay" xml:base="https://evil.example/" xmlns:foo="urn:foo"><rect class="x"/></g>'));
    expect(out).not.toMatch(/class=|xml:base|xmlns:foo|evil/);
    expect(render(out).querySelector('[class]')).toBeNull();
  });

  it.each([
    ['href', '<set attributeName="href" to="javascript:alert(1)"/>'],
    ['href with a harmless value', '<set attributeName="href" to="https://evil.example"/>'],
    ['xlink:href', '<animate attributeName="xlink:href" values="#a;https://evil.example"/>'],
    ['HREF (uppercase)', '<set attributeName="HREF" to="https://evil.example"/>'],
    ['Xlink:Href (mixed case)', '<set attributeName="Xlink:Href" to="https://evil.example"/>'],
    ['style', '<set attributeName="style" to="fill:red"/>'],
    ['class', '<animate attributeName="class" values="a;b"/>'],
    ['onclick', '<set attributeName="onclick" to="alert(1)"/>'],
    ['ONCLICK', '<animateTransform attributeName="ONCLICK" to="alert(1)"/>'],
    ['onbegin', '<animateMotion attributeName="onbegin" to="alert(1)"/>'],
  ])('drops animations that target %s', (_label, anim) => {
    const out = sanitizeSvg(svg(`<a><rect/></a><rect width="1">${anim}</rect>`));
    expect(out).not.toMatch(/<set|<animate/);
    expect(out).toContain('width="1"');
    expect(dangers(out)).toEqual([]);
  });

  it('keeps animations that target harmless attributes', () => {
    const out = sanitizeSvg(svg('<rect><set attributeName="fill" to="red"/><animate attributeName="opacity" values="0;1"/></rect>'));
    expect(out).toContain('<set');
    expect(out).toContain('<animate');
  });

  it('does not treat an animation with a soft hyphen in attributeName as a handler (no such attribute exists)', () => {
    const out = sanitizeSvg(svg('<rect><animate attributeName="on­click" to="alert(1)"/></rect>'));
    // The soft hyphen makes it a different, non-existent attribute: kept, but it cannot name an event handler.
    const anim = render(out).querySelector('animate');
    if (anim) expect(anim.getAttribute('attributeName')).not.toBe('onclick');
  });

  it('removes CDATA payloads (they are not text nodes the sanitiser copies)', () => {
    const out = sanitizeSvg(svg('<g><![CDATA[</g><script>alert(1)</script>]]></g>'));
    expect(out).not.toMatch(/script|alert/);
  });

  it('leaves nothing executable from a mixed attack payload', () => {
    const payload = svg(
      '<script>alert(1)</script><svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(2)</svg:script>' +
      '<foreignObject><iframe src="javascript:alert(3)"/></foreignObject>' +
      '<a href="javascript:alert(4)"><rect/></a>' +
      '<image href="data:image/svg+xml,x" onload="alert(5)"/>' +
      '<g onload="alert(6)"><rect onclick="alert(7)" fill="&#106;avascript:alert(8)"/></g>' +
      '<use href="http://evil.example/x.svg#a"/><use xlink:href="JAVASCRIPT:alert(9)"/>' +
      '<rect><set attributeName="href" to="javascript:alert(10)"/><animate attributeName="xlink:href" values="javascript:alert(11)"/></rect>' +
      '<rect style="fill:url(http://evil.example/t)"/><style>*{}</style>',
      'onload="alert(12)"'
    );
    const out = sanitizeSvg(payload);
    expect(out).not.toMatch(/alert|javascript|evil|script/i);
    expect(dangers(out)).toEqual([]);
  });
});

describe('sanitizeSvg: bypasses found while testing (asserting the safe behaviour)', () => {
  // The output is parsed as HTML (dangerouslySetInnerHTML), which lowercases attribute names, but the sanitiser's
  // checks for href/xlink:href, style and class are case-sensitive.
  it('an uppercase HREF attribute escapes the #id-only link rule and becomes an external href', () => {
    const out = sanitizeSvg(svg('<use HREF="https://evil.example/sprite.svg#a"/>'));
    expect(dangers(out)).toEqual([]);
  });

  it('an uppercase CLASS attribute survives and becomes class after HTML parsing', () => {
    const out = sanitizeSvg(svg('<rect CLASS="app-overlay"/>'));
    expect(render(out).querySelector('[class]')).toBeNull();
  });

  // CSS escapes make "u\72 l(" a url( token for the browser's CSS parser, but the regexes look for the literal "url(".
  it('a CSS-escaped url() in style loads an external resource', () => {
    const out = sanitizeSvg(svg('<rect style="fill:u\\72 l(https://evil.example/track)"/>'));
    expect(out).not.toContain('evil.example');
  });

  it('a CSS-escaped url() in a presentation attribute loads an external resource', () => {
    const out = sanitizeSvg(svg('<rect fill="u\\72 l(https://evil.example/track)"/>'));
    expect(out).not.toContain('evil.example');
  });

  it('image-set() in style references an external image without url()', () => {
    const out = sanitizeSvg(svg('<rect style="mask-image:image-set(\'https://evil.example/track\' 1x)"/>'));
    expect(out).not.toContain('evil.example');
  });
});

describe('sanitizeSvg: id namespacing', () => {
  it('rewrites ids and every #id, url(#id) and href="#id" reference to the id token', () => {
    const out = sanitizeSvg(svg(
      '<defs><linearGradient id="grad"/><path id="arc" d="M0 0"/><clipPath id="clip"/></defs>' +
      '<rect fill="url(#grad)" clip-path="url(#clip)"/><use href="#arc"/>' +
      '<text><textPath href="#arc">along</textPath></text>' +
      '<circle><animateMotion dur="2s"><mpath xlink:href="#arc"/></animateMotion></circle>'
    ));
    expect(out).toContain('id="__hzid__-grad"');
    expect(out).toContain('id="__hzid__-arc"');
    expect(out).toContain('fill="url(#__hzid__-grad)"');
    expect(out).toContain('clip-path="url(#__hzid__-clip)"');
    expect(out.match(/href="#__hzid__-arc"/g)).toHaveLength(3);
    expect(out).not.toMatch(/"#arc"|url\(#grad\)/);
  });

  it('does not let an id that is a prefix of another (a vs ab) corrupt references', () => {
    const out = sanitizeSvg(svg(
      '<rect id="a"/><rect id="ab"/><rect id="a-b"/>' +
      '<use href="#a"/><use href="#ab"/><use href="#a-b"/><rect fill="url(#ab)" stroke="url(#a)"/>'
    ));
    const host = render(out);
    expect([...host.querySelectorAll('rect[id]')].map(r => r.id)).toEqual(['__hzid__-a', '__hzid__-ab', '__hzid__-a-b']);
    expect([...host.querySelectorAll('use')].map(u => u.getAttribute('href'))).toEqual(['#__hzid__-a', '#__hzid__-ab', '#__hzid__-a-b']);
    expect(out).toContain('fill="url(#__hzid__-ab)"');
    expect(out).toContain('stroke="url(#__hzid__-a)"');
    expect(out).not.toContain('__hzid__-__hzid__');
  });

  it('rewrites SMIL timing references in begin and end, including lists and offsets', () => {
    const out = sanitizeSvg(svg(
      '<rect id="a"><animate id="x" attributeName="x" begin="a.click; 0s" dur="1s"/></rect>' +
      '<rect id="b"><animate id="y" attributeName="y" begin="x.end+0.2s" end="x.begin; y.end" dur="1s"/></rect>' +
      '<animate attributeName="opacity" begin="indefinite" end="3s"/>'
    ));
    expect(out).toContain('begin="__hzid__-a.click; 0s"');
    expect(out).toContain('begin="__hzid__-x.end+0.2s"');
    expect(out).toContain('end="__hzid__-x.begin; __hzid__-y.end"');
    expect(out).toContain('begin="indefinite"');
    expect(out).toContain('end="3s"');
  });

  // Hardened here (Task 2.2): a reference to an id the drawing does not define is dropped instead of kept as it was.
  it('only rewrites SMIL references to ids that exist, at a token start, and drops the others', () => {
    const out = sanitizeSvg(svg('<rect id="x"/><animate attributeName="x" begin="xx.end; ax.end; x.end"/>'));
    expect(out).toContain('begin=" __hzid__-x.end"');
  });

  it('handles ids containing regex metacharacters', () => {
    const out = sanitizeSvg(svg('<rect id="a.b"/><use href="#a.b"/><rect id="c+d"/><animate attributeName="x" begin="c+d.end"/>'));
    expect(out).toContain('id="__hzid__-a.b"');
    expect(out).toContain('id="__hzid__-c+d"');
    expect(out).toContain('begin="__hzid__-c+d.end"');
  });

  it('instance() swaps the token for a per-copy prefix, so two copies get distinct ids', () => {
    const markup = sanitizeSvg(svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><animate id="t" begin="t.end"/>'));
    const one = instance(markup, 'hz1'), two = instance(markup, 'hz2');
    expect(one).not.toContain('__hzid__');
    expect(one).toContain('id="hz1-g"');
    expect(one).toContain('url(#hz1-g)');
    expect(one).toContain('begin="hz1-t.end"');
    expect(two).toContain('id="hz2-g"');
    expect(two).toContain('url(#hz2-g)');
    const ids = (s: string) => [...render(s).querySelectorAll('[id]')].map(e => e.id);
    expect(ids(one).filter(id => ids(two).includes(id))).toEqual([]);
  });

  it('instance() leaves markup without ids unchanged', () => {
    expect(instance('<rect width="1"/>', 'p')).toBe('<rect width="1"/>');
  });

  // The rewrite is a plain string replace over the serialised markup, so it also hits text and colour values.
  it('text content mentioning "#id" is rewritten as if it were a reference', () => {
    const out = sanitizeSvg(svg('<text id="growth">Tag #growth</text>'));
    expect(render(out).querySelector('text')!.textContent).toBe('Tag #growth');
  });

  it('a hex colour equal to an id ("#ace" with id="ace") is rewritten and broken', () => {
    const out = sanitizeSvg(svg('<rect id="ace" fill="#ace"/>'));
    expect(render(out).querySelector('rect')!.getAttribute('fill')).toBe('#ace');
  });
});

// Hardened in this copy after a security review (Task 2.2); Horizon's original keeps these.
describe('sanitizeSvg: no reach outside the drawing', () => {
  it('writes an uppercase ID or HREF under its lower-case name, prefixed like any other', () => {
    const host = render(sanitizeSvg(svg('<path ID="p" d="M0 0"/><use HREF="#p"/><rect ID="lonely"/>')));
    expect([...host.querySelectorAll('[id]')].map((e) => e.getAttribute('id'))).toEqual(['__hzid__-p', '__hzid__-lonely']);
    expect(host.querySelector('use')!.getAttribute('href')).toBe('#__hzid__-p');
    host.remove();
  });
  it('prefixes every id, also one nothing refers to', () => {
    expect(sanitizeSvg(svg('<rect id="app-root"/>'))).toContain('id="__hzid__-app-root"');
  });
  it('drops an href to an id the drawing does not define', () => {
    const out = sanitizeSvg(svg('<use href="#outside"/><use xlink:href="#outside"/><use HREF="#outside"/>'));
    expect(out).not.toContain('outside');
    expect(render(out).querySelector('[href]')).toBeNull();
  });
  it('turns url() to an id the drawing does not define into none in an attribute, and drops it from a style', () => {
    const out = sanitizeSvg(svg('<defs><linearGradient id="g"/></defs><rect fill="url(#outside)" stroke="url(#g)" style="clip-path: url(#outside); fill: url(#g)"/>'));
    expect(out).not.toContain('outside');
    expect(out).toContain('fill="none"');
    expect(out).toContain('stroke="url(#__hzid__-g)"');
    expect(out).not.toMatch(/clip-path/);
    expect(out).toMatch(/fill: url\(#__hzid__-g\)/);
  });
  it('keeps only SMIL timing it knows: offsets, clock values, indefinite and events of its own ids', () => {
    const begin = (b: string) => render(sanitizeSvg(svg('<rect id="a"><animate attributeName="x" begin="' + b + '"/></rect>'))).querySelector('animate')!.getAttribute('begin');
    expect(begin('x.click')).toBeNull();
    expect(begin('foo(1)')).toBeNull();
    expect(begin('accessKey(a)')).toBeNull();
    expect(begin('wallclock(2026-01-01T00:00:00Z)')).toBeNull();
    expect(begin('click')).toBeNull();
    expect(begin('2s')).toBe('2s');
    expect(begin('indefinite')).toBe('indefinite');
    expect(begin('-0.5s; 1:30; 250ms')).toBe('-0.5s; 1:30; 250ms');
    expect(begin('a.click+1s; a.repeat(2)')).toBe('__hzid__-a.click+1s; __hzid__-a.repeat(2)');
    expect(begin('a.click(javascript)')).toBeNull();
  });
  it('neutralises url() forms the plain url(#id) rule does not match', () => {
    const out = sanitizeSvg(svg('<rect id="a" fill="url( #a" stroke="url(#a) url(http://x.example)" mask="url(#a" style="fill:url(\\23 a); opacity: 1; stroke: url(#a) url(//x.example)"/>'));
    const rect = render(out).querySelector('rect')!;
    ['fill', 'stroke', 'mask'].forEach((n) => expect(rect.getAttribute(n), n).toBeNull());
    expect(rect.getAttribute('style')).toBe(' opacity: 1');
    expect(out).not.toContain('x.example');
  });
  it('drops a SMIL begin or end that waits on an element outside the drawing, keeping the rest', () => {
    const out = sanitizeSvg(svg('<rect id="a"><animate attributeName="x" begin="outside.click" end="outside.end; 2s"/><set attributeName="y" BEGIN="outside.click; a.click" to="1"/></rect>'));
    expect(out).not.toContain('outside');
    expect(out).not.toMatch(/ begin="outside/);
    expect(out).toContain('end=" 2s"');
    expect(out).toContain('begin=" __hzid__-a.click"');
  });
});
