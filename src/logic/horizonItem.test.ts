// A Presentation's one item (studios plan, Task 3.3): the summary of its .horizon file, the same rule as private.horizon_ok,
// what reviewers see of it, and the content it publishes as.
import { describe, expect, it } from 'vitest';
import { parseFormatContent } from '../lib/contentStore';
import { latestMatch } from '../test/migrations';
import { HORIZON_SECONDS_MAX, HORIZON_SLIDES_MAX, HORIZON_TITLE_MAX, mediaHours, deckLine, isHorizonItem } from './horizonItem';
import type { HorizonItem } from './horizonItem';
import { carriesItems, itemRows, itemsFromSaved, itemsText, ITEM_MAX } from './items';
import { COMPLETION, completionText, completionTodo, selfCompletes } from './record';
import { COVER_KIND } from './covers';

const PATH = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/presentation.horizon';
const item: HorizonItem = { kind: 'horizon', path: PATH, title: 'Garden tour', slides: 3, seconds: 0 };

describe('a Presentation item', () => {
  it('is the file\'s summary: kind, a .horizon path in the media folder shape, a title, its slides and seconds', () => {
    expect(isHorizonItem(item)).toBe(true);
    expect(isHorizonItem({ ...item, seconds: 95.5 })).toBe(true);
  });
  it.each([
    ['another kind', { kind: 'motion' }], ['a path that is not .horizon', { path: PATH.replace('.horizon', '.json') }], ['a path outside the folder shape', { path: '../a.horizon' }],
    ['a blank title', { title: '  ' }], ['a long title', { title: 'x'.repeat(HORIZON_TITLE_MAX + 1) }], ['no slides', { slides: 0 }], ['slides as text', { slides: '3' }],
    ['part of a slide', { slides: 2.5 }], ['too many slides', { slides: HORIZON_SLIDES_MAX + 1 }], ['negative seconds', { seconds: -1 }], ['too many seconds', { seconds: HORIZON_SECONDS_MAX + 1 }],
    ['an extra key', { svg: '<svg/>' }],
  ])('refuses %s', (_, patch) => { expect(isHorizonItem({ ...item, ...patch })).toBe(false); });
  it('repeats private.horizon_ok\'s limits', () => {
    const body = latestMatch(/create (?:or replace )?function private\.horizon_ok\([\s\S]*?\$\$([\s\S]*?)\$\$/)[1];
    expect(body).toContain("char_length(e ->> 'title') <= " + HORIZON_TITLE_MAX);
    expect(body).toContain('between 1 and ' + HORIZON_SLIDES_MAX);
    expect(body).toContain('between 0 and ' + HORIZON_SECONDS_MAX);
    expect(body).toContain("right(e ->> 'path', 8) = '.horizon'");
    expect(body).toContain('jsonb_object_keys(e)) = 5');
  });
});

describe('the Presentation format', () => {
  it('always carries its one item, from the upload form too', () => {
    expect(carriesItems('Presentation', null)).toBe(true);
    expect(ITEM_MAX.Presentation).toBe(1);
    expect(itemsFromSaved('Presentation', [item])).toEqual([item]);
    expect(itemsFromSaved('Presentation', [{ ...item, kind: 'x' }])).toEqual([]);
  });
  it('shows reviewers one row and scans its title for client names', () => {
    expect(itemRows('Presentation', [item])).toEqual([{ front: 'Horizon presentation · 3 slides · counts 0.25 h', back: 'Garden tour' }]);
    expect(itemRows('Presentation', [{ ...item, slides: 1, seconds: 125 }])).toEqual([{ front: 'Horizon presentation · 1 slide · narrated, 2 min 5 s · counts 0.05 h', back: 'Garden tour' }]);
    expect(itemsText([item])).toEqual(['Garden tour']);
  });
  it('publishes as horizon content, read back strictly', () => {
    expect(parseFormatContent(item)).toEqual(item);
    expect(parseFormatContent({ ...item, path: 'https://example.com/a.horizon' })).toBeNull();
  });
  it('completes itself when the learner reaches the last slide (media)', () => {
    expect(COMPLETION.Presentation).toBe('media');
    expect(selfCompletes('Presentation')).toBe(true);
    expect(completionText('Presentation', 'Sam Coach')).toBe('Playing it to the last slide completes it. It counts right away; no acceptance needed.');
    expect(completionTodo('Presentation')).toBe('play it to the last slide');
  });
  it('has its own library cover', () => { expect(COVER_KIND.Presentation).toBe('deck'); });
});

describe('the hours a published Presentation counts (a default awaiting the owner)', () => {
  it('is its narration length rounded up to 0.05 h (at least 0.05 h, at most 1 h), or 0.25 h without a narration', () => {
    expect(mediaHours(0)).toBe(0.25);
    expect([1, 180].map(mediaHours)).toEqual([0.05, 0.05]);
    expect([181, 360, 361].map(mediaHours)).toEqual([0.1, 0.1, 0.15]);
    expect(mediaHours(3600)).toBe(1);
    expect([3601, 7200, HORIZON_SECONDS_MAX].map(mediaHours)).toEqual([1, 1, 1]); // capped: the seconds are the file's own claim
  });
  it('is told to reviewers and in Mine as "counts N h"', () => {
    expect(deckLine({ slides: 1, seconds: 0 })).toBe('1 slide · counts 0.25 h');
    expect(deckLine({ slides: 3, seconds: 125 })).toBe('3 slides · narrated, 2 min 5 s · counts 0.05 h');
    expect(deckLine({ slides: 3, seconds: 9000 })).toBe('3 slides · narrated, 150 min · counts 1 h');
  });
  it('is the same arithmetic in private.media_hours, which publishing uses', () => {
    const body = latestMatch(/create (?:or replace )?function private\.media_hours\([\s\S]*?\$\$([\s\S]*?)\$\$/)[1];
    expect(body).toContain('0.25');
    expect(body).toContain('least(1, greatest(1, ceil(p_seconds / 180)) * 0.05)');
    expect(latestMatch(/create (?:or replace )?function private\.publish_contribution\([\s\S]*?\n\$\$;/)[0]).toContain("when 'Presentation' then private.media_hours((v_content ->> 'seconds')::numeric)");
  });
});
