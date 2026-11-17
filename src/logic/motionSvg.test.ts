// @vitest-environment jsdom
// Motion Studio's drawing (studios plan, Task 2.3): the strict reading of an AI drawing (Review Focus 1: an SVG that does
// not start with <svg or is over 60,000 characters is refused, and only a drawing that survives the sanitiser counts), the
// scripted flow of boxes and arrows built from the stages, the stage cues and the text alternative.
import { describe, expect, it } from 'vitest';
import { ALT_MAX, ANIMATED_MAX, SVG_MAX, animatedCount, drawingOf, isDrawing, motionLayout, readMotionSvg, stageAt, stageCues, textAlternative } from './motionSvg';
import { sanitizeSvg } from './sanitizeSvg';

const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320">';
const ANIMATED = HEAD + '<rect width="40" height="20" style="fill:var(--tc-green, #86BC25)"><animate attributeName="opacity" from="0" to="1" dur="1s" fill="freeze"/></rect></svg>';
const STAGES = [{ label: 'Order', text: 'The customer orders.' }, { label: 'Deliver', text: 'Goods leave.' }, { label: 'Cash & <applied>', text: 'The books close.' }];

describe('readMotionSvg: an AI drawing is read strictly, never repaired', () => {
  it('keeps an animated <svg>, trimmed', () => {
    expect(readMotionSvg('  ' + ANIMATED + '\n')).toBe(ANIMATED);
  });
  it('refuses an answer that does not start with <svg (prose or a code fence first)', () => {
    expect(readMotionSvg('Here is the flow: ' + ANIMATED)).toBeNull();
    expect(readMotionSvg('```svg\n' + ANIMATED + '\n```')).toBeNull();
    expect(readMotionSvg('<?xml version="1.0"?>' + ANIMATED)).toBeNull();
  });
  it('refuses a drawing over ' + SVG_MAX + ' characters', () => {
    const big = HEAD + '<animate attributeName="opacity" dur="1s"/>' + '<rect width="1" height="1"/>'.repeat(3000) + '</svg>';
    expect(big.length).toBeGreaterThan(SVG_MAX);
    expect(readMotionSvg(big)).toBeNull();
  });
  it('refuses a drawing nothing of which survives the sanitiser', () => {
    expect(readMotionSvg(HEAD + '<script>alert(1)</script><foreignObject><div/></foreignObject></svg>')).toBeNull();
    expect(readMotionSvg('<svg><rect></svg>')).toBeNull();
  });
  it('refuses a drawing that does not move, and one with more than ' + ANIMATED_MAX + ' animated elements', () => {
    expect(readMotionSvg(HEAD + '<rect width="40" height="20"/></svg>')).toBeNull();
    const busy = HEAD + Array.from({ length: ANIMATED_MAX + 1 }, () => '<circle r="2"><animate attributeName="r" values="2;4;2" dur="1s" repeatCount="indefinite"/></circle>').join('') + '</svg>';
    expect(readMotionSvg(busy)).toBeNull();
  });
  it('counts only animations that survive the sanitiser', () => {
    expect(animatedCount(HEAD + '<rect><set attributeName="href" to="https://evil.example"/><animate attributeName="opacity" dur="1s"/></rect></svg>')).toBe(1);
  });
});

describe('motionLayout: the scripted flow of boxes and arrows', () => {
  it('draws one box per stage in the 640 × 320 view box, labels escaped, colours from the tokens', () => {
    const svg = motionLayout(STAGES, 45, false);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 640 320"');
    expect(svg).toContain('Cash &amp;');
    expect(svg).not.toContain('<applied>');
    expect(svg).toContain('var(--tc-green');
    expect(animatedCount(svg)).toBe(0);
    const out = sanitizeSvg(svg);
    ['Order', 'Deliver'].forEach((l) => expect(out).toContain(l));
  });
  it('animates the build-in and each stage at its cue, within the caps, so the strict reading accepts it', () => {
    const many = Array.from({ length: 7 }, (_, k) => ({ label: 'Stage ' + (k + 1), text: 'x' }));
    const svg = motionLayout(many, 90, true);
    expect(animatedCount(svg)).toBeGreaterThan(0);
    expect(animatedCount(svg)).toBeLessThanOrEqual(ANIMATED_MAX);
    expect(readMotionSvg(svg)).toBe(svg);
    stageCues(7, 90).forEach((c) => expect(svg).toContain('begin="' + c.toFixed(2) + 's"'));
  });
  it('breaks a long label over two lines and shortens what still does not fit', () => {
    const svg = motionLayout([{ label: 'Cash applied to the open invoice and the books closed', text: 'x' }, ...STAGES.slice(0, 2)], 20, false);
    expect(svg).toContain('<tspan');
    expect(svg).toContain('…');
  });
});

describe('stage cues', () => {
  it('builds in over the first 2.5 s, then gives each stage an equal share of the rest', () => {
    expect(stageCues(3, 20)).toEqual([2.5, 2.5 + 17.5 / 3, 2.5 + 35 / 3]);
  });
  it('names the stage in focus at a moment: the first during the build-in, the last at the end', () => {
    expect([stageAt(3, 20, 0), stageAt(3, 20, 9), stageAt(3, 20, 15), stageAt(3, 20, 20)]).toEqual([0, 1, 2, 2]);
  });
});

describe('the text alternative and the drawing entry', () => {
  it('says every stage in order, within ' + ALT_MAX + ' characters', () => {
    expect(textAlternative(STAGES)).toBe('An animated flow in 3 stages. 1. Order: The customer orders. 2. Deliver: Goods leave. 3. Cash & <applied>: The books close.');
    expect(textAlternative(Array.from({ length: 7 }, () => ({ label: 'x'.repeat(300), text: 'y'.repeat(600) }))).length).toBeLessThanOrEqual(ALT_MAX);
  });
  it('tells the drawing apart from the stage rows and exam questions', () => {
    const d = { svg: ANIMATED, alt: 'A flow.', made: 'ai' as const, seconds: 45 };
    expect(isDrawing(d)).toBe(true);
    expect(isDrawing({ ...d, made: 'magic' })).toBe(false);
    expect(isDrawing({ ...d, alt: 3 })).toBe(false);
    expect(isDrawing({ ...d, seconds: undefined })).toBe(false);
    expect(isDrawing(['Order', 'x'])).toBe(false);
    expect(drawingOf([['Order', 'x'], d])).toBe(d);
    expect(drawingOf([['Order', 'x']])).toBeNull();
  });
});
