// @vitest-environment jsdom
// The Animated flow (studios plan, Task 2.3) as content: its stage rows and one drawing in the items, what they publish
// as (studioContent = private.motion_content), what still blocks sending (no animation, no text alternative), its
// completion, and the SQL that repeats these rules kept in step with the TypeScript.
import { describe, expect, it } from 'vitest';
import { parseFormatContent } from '../lib/contentStore';
import { STUDIOS } from '../studioData';
import { aiAssisted, itemRows, itemsFromSaved, itemsText, ITEM_MAX } from './items';
import { ALT_MAX, SVG_MAX } from './motionSvg';
import type { MotionDrawing } from './motionSvg';
import { COMPLETION, completionTodo } from './record';
import { ALT_NEEDED, BUILD_FIRST, LENGTH_CHANGED, MOTION_LENGTH, MOTION_SECONDS, motionProblems, motionSeconds, outputProblems, studioContent } from './studioContent';
import { itemsValid, questionsOf, stepsOf, studioById } from './studios';
import type { StudioEntry, StudioItem } from './studios';

const def = studioById('motion')!;
const STAGES: StudioItem[] = [['Order', 'The customer orders. '], ['Deliver', 'Goods leave.'], ['Collect', 'Payment arrives.']];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="9" height="9"><animate attributeName="opacity" dur="1s"/></rect></svg>';
const DRAWN: MotionDrawing = { svg: SVG, alt: ' Three stages, order to cash. ', made: 'ai', seconds: 20 };
const AT20 = { [MOTION_LENGTH]: '20 s' };
const list = (d: Partial<MotionDrawing> | null = {}): StudioEntry[] => [...STAGES, ...(d ? [{ ...DRAWN, ...d } as MotionDrawing] : [])];

describe('studioContent for an Animated flow', () => {
  it('publishes the stages, the drawing, its text alternative, the length it was built for and who made it, as private.motion_content does', () => {
    const c = studioContent('Animated flow', list(), AT20);
    expect(c).toEqual({ kind: 'motion', stages: [{ label: 'Order', text: 'The customer orders.' }, { label: 'Deliver', text: 'Goods leave.' }, { label: 'Collect', text: 'Payment arrives.' }],
      svg: SVG, alt: 'Three stages, order to cash.', seconds: 20, made: 'ai' });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('maps "Length?" to 20, 45 or 90 seconds, 45 when unanswered', () => {
    expect(def.qs.find((q) => q[0] === MOTION_LENGTH)![1]).toEqual(Object.keys(MOTION_SECONDS));
    expect([motionSeconds({ [MOTION_LENGTH]: '20 s' }), motionSeconds({ [MOTION_LENGTH]: '90 s' }), motionSeconds({}), motionSeconds({ [MOTION_LENGTH]: '3 h' })]).toEqual([20, 90, 45, 45]);
  });
  it('has no content until the flow is animated for the chosen length: no drawing, only the plain layout, or built for another length', () => {
    expect(studioContent('Animated flow', list(null), AT20)).toBeNull();
    expect(studioContent('Animated flow', list({ made: 'layout' }), AT20)).toBeNull();
    expect(studioContent('Animated flow', list({ made: 'scripted' }), AT20)).toMatchObject({ made: 'scripted', seconds: 20 });
    expect(studioContent('Animated flow', list(), { [MOTION_LENGTH]: '90 s' })).toBeNull();
    expect(studioContent('Animated flow', list({ seconds: 45 }), {})).toMatchObject({ seconds: 45 });
  });
  it('is read back only with a known maker and a length of 1 to 90 seconds', () => {
    const c = studioContent('Animated flow', list(), AT20)!;
    expect(parseFormatContent({ ...c, made: 'layout' })).toBeNull();
    expect(parseFormatContent({ ...c, seconds: 91 })).toBeNull();
    expect(parseFormatContent({ ...c, seconds: 0 })).toBeNull();
  });
});

describe('what blocks sending an Animated flow', () => {
  it('needs the animation built for the chosen length, and a text alternative', () => {
    expect(motionProblems(list(null), AT20)).toEqual([BUILD_FIRST]);
    expect(motionProblems(list({ made: 'layout' }), AT20)).toEqual([BUILD_FIRST]);
    expect(motionProblems(list(), { [MOTION_LENGTH]: '90 s' })).toEqual([LENGTH_CHANGED]);
    expect(motionProblems(list({ alt: '  ' }), AT20)).toEqual([ALT_NEEDED]);
    expect(motionProblems(list({ alt: 'x'.repeat(ALT_MAX + 1) }), AT20).join(' ')).toMatch(/at most 2000/);
    expect(motionProblems(list(), AT20)).toEqual([]);
    expect(outputProblems(def, list(null), AT20)).toEqual([BUILD_FIRST]);
    expect(outputProblems(studioById('aid')!, [], {})).toEqual([]);
  });
  it('keeps the drawing out of the Draft step\'s rules: the stages count, at most one place short of the items cap', () => {
    expect(itemsValid(def, list())).toEqual([]);
    expect(itemsValid(def, list(null))).toEqual([]);
    expect(itemsValid(def, [...STAGES.slice(0, 2), DRAWN]).join(' ')).toMatch(/at least 3 items/);
    const eight = Array.from({ length: ITEM_MAX['Animated flow'] }, (_, k): StudioItem => ['Stage ' + k, 'x']);
    expect(itemsValid(def, eight).join(' ')).toMatch(/at most 7 stages/);
    expect(stepsOf(list())).toEqual(STAGES);
    expect(questionsOf(list())).toEqual([]);
  });
});

describe('the drawing in the item store', () => {
  it('is read back from a saved contribution, shown to reviewers, scanned for client names and makes it AI-assisted when AI drew it', () => {
    expect(itemsFromSaved('Animated flow', list())).toEqual(list());
    expect(itemsFromSaved('Animated flow', [...STAGES, { svg: SVG }])).toEqual([]);
    expect(itemsFromSaved('Animated flow', [...STAGES, { ...DRAWN, seconds: '20' }])).toEqual([]);
    expect(itemRows('Animated flow', list()).pop()).toEqual({ front: 'Animation · Made with AI', back: DRAWN.alt });
    expect(itemsText(list())).toContain(DRAWN.alt);
    expect(itemsText(list())).toContain(SVG);
    const items = (d: Partial<MotionDrawing>) => ({ list: list(d) as never, how: 'manual' as const, note: '', problems: [] });
    expect(aiAssisted({ ai: false, items: items({ made: 'ai' }) })).toBe(true);
    expect(aiAssisted({ ai: false, items: items({ made: 'scripted' }) })).toBe(false);
  });
});

describe('the Motion Studio offers only what it delivers', () => {
  it('is available; "What moves?", "Style" and "Pace" steer the AI drawing, "Length?" is published, "Sound?" is gone', () => {
    expect(def.available).toBe(true);
    expect(def.qs).toEqual([['What moves?', ['A process flow', 'A data flow', 'A timeline'], 'draft'], [MOTION_LENGTH, ['20 s', '45 s', '90 s']]]);
    expect(def.rows).toEqual([['Style', ['Boxes and arrows', 'Swimlanes'], 'animation'], ['Pace', ['Calm', 'Brisk'], 'animation']]);
    expect(def.build).toEqual(['Drawing the flow', 'Animating each stage', 'Writing the text alternative']);
  });
  it('completes by a mark: the end reached, or the text version read', () => {
    expect(COMPLETION['Animated flow']).toBe('mark');
    expect(completionTodo('Animated flow', true)).toBe('reach the end, or read the text version');
  });
});

// ---------- SQL in step ----------
const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(migrations).sort();
function body(fn: string): string {
  const re = new RegExp('create (?:or replace )?function ' + fn.replace('.', '\\.') + '\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$');
  for (const f of files.slice().reverse()) { const m = re.exec(migrations[f]); if (m) return m[1]; }
  throw new Error('no migration defines ' + fn);
}

describe('the database repeats the Animated flow rules', () => {
  it('private.drawing_ok: an <svg> of at most SVG_MAX characters, a text alternative of at most ALT_MAX, made by AI or scripted, built for a length of MOTION_SECONDS', () => {
    const b = body('private.drawing_ok');
    expect(b).toContain("left(e ->> 'svg', 4) = '<svg'");
    expect(b).toContain("char_length(e ->> 'svg') <= " + SVG_MAX);
    expect(b).toContain("btrim(e ->> 'alt') <> ''");
    expect(b).toContain("char_length(e ->> 'alt') <= " + ALT_MAX);
    expect(b).toContain("(e ->> 'made') in ('ai', 'scripted')");
    expect(b).toContain("jsonb_typeof(e -> 'seconds') is not distinct from 'number' and (e ->> 'seconds') in (" + Object.values(MOTION_SECONDS).map((v) => "'" + v + "'").join(', ') + ')');
  });
  it('private.motion_ok: stage rows one short of the cap, and exactly one drawing', () => {
    const b = body('private.motion_ok');
    expect(b).toContain("private.item_max('Animated flow') - 1, 2)");
    expect(b).toContain("where jsonb_typeof(e) <> 'array') = 1");
    expect(b).toContain('private.drawing_ok(e)');
    expect(body('private.items_ok')).toContain("when p_type = 'Animated flow' then private.motion_ok(p_items)");
  });
  it('the explainer\'s and the flow\'s rows come from one helper, private.rows_of', () => {
    expect(body('private.rows_of')).toContain("where jsonb_typeof(x.e) = 'array'");
    ['private.explainer_ok', 'private.motion_ok', 'private.explainer_content', 'private.motion_content'].forEach((fn) => {
      expect(body(fn), fn).toContain('private.rows_of(p_items)');
      expect(body(fn), fn).not.toContain("jsonb_typeof(x.e) = 'array'");
    });
  });
  it('private.motion_content publishes the length the drawing was built for', () => {
    const b = body('private.motion_content');
    expect(b).toContain("'seconds', (d.e ->> 'seconds')::integer");
    expect(b).not.toContain('p_shape');
    expect(body('private.contribution_content')).toContain("when 'Animated flow' then private.motion_content(p_items)");
  });
  it('private.contribution_problems counts only the stages toward the minimum and names what an Animated flow lacks', () => {
    const p = body('private.contribution_problems');
    expect(p).toContain("c.type not in ('Interactive explainer', 'Animated flow') or jsonb_typeof(e) = 'array'");
    expect(p).toContain("when 'Animated flow' then 'Add the stages, build the animation and write its text alternative first'");
  });
  it('publishes an Animated flow as a short media learning', () => {
    expect(body('private.publish_contribution')).toContain("when 'Animated flow' then 0.025");
  });
  it('every available studio\'s format is in private.contribution_content', () => {
    STUDIOS.filter((d) => d.available).forEach((d) => expect(body('private.contribution_content')).toContain("when '" + d.format + "' then"));
  });
});
