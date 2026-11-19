// The course rules exist twice: courseContent.ts (TypeScript) and private.course_* in 20261119100000_elearning_studio.sql. This reads the
// migration and pins what both sides share: the caps, every sentence and the hours.
import { describe, expect, it } from 'vitest';
import { migrationText } from '../test/migrations';
import { BLOCK_KINDS, BLOCK_ID, EMBED_FORMATS, EMBED_LEARNING, embedProblems, COURSE_CAPS, COURSE_HOURS, COURSE_LENGTH, COURSE_RULES, COMPLETION_QUESTION, KIND_NAME, SCORED_KINDS, SHAPE_RULE, WORDS } from './courseContent';
import { ITEM_MAX } from './items';

// The embed block's migration redefines the block functions of the first; every sentence is pinned in the two together.
const embedSql = migrationText('_course_embeds.sql').replace(/\s+/g, ' ');
const sql = migrationText('_elearning_studio.sql').replace(/\s+/g, ' ') + ' ' + embedSql;
const quoted = (s: string) => "'" + s.replace(/'/g, "''") + "'";

describe('course rules: TypeScript and the database agree', () => {
  it('has the caps', () => {
    expect(ITEM_MAX['E-learning']).toBe(252);
    expect(sql).toContain("('E-learning', 252)");
    expect(sql).toContain("('elearn', 'E-learning', 2)");
    expect(sql).toContain('between ' + COURSE_CAPS.lessons[0] + ' and ' + COURSE_CAPS.lessons[1]);
    expect(sql).toContain('> ' + COURSE_CAPS.blocksPerLesson);
    expect(sql).toContain("in (" + SCORED_KINDS.map((k) => quoted(k)).join(', ') + ")");
    expect(sql).toContain('< ' + COURSE_CAPS.number.toExponential().replace('e+', 'e'));
    expect(sql).toContain('octet_length(p_items::text) <= ' + COURSE_CAPS.bytes);
    expect(sql).toContain("^" + BLOCK_ID.source.slice(1));
    for (const n of [COURSE_CAPS.heading, COURSE_CAPS.text, COURSE_CAPS.callout, COURSE_CAPS.panelBody, COURSE_CAPS.panelTitle, COURSE_CAPS.bin, COURSE_CAPS.card, COURSE_CAPS.choice, COURSE_CAPS.outcome, COURSE_CAPS.prompt, COURSE_CAPS.unit]) {
      expect(sql, 'cap ' + n).toMatch(new RegExp('\\b' + n + '\\b'));
    }
    expect(sql).toContain('between ' + COURSE_CAPS.panels[0] + ' and ' + COURSE_CAPS.panels[1]);
    expect(sql).toContain('between ' + COURSE_CAPS.cards[0] + ' and ' + COURSE_CAPS.cards[1]);
    expect(sql).toContain('between ' + COURSE_CAPS.choices[0] + ' and ' + COURSE_CAPS.choices[1]);
  });
  it('lists every block kind with its name and its sentence', () => {
    for (const k of BLOCK_KINDS) {
      expect(sql, k).toContain(quoted(k) + ', ' + quoted(KIND_NAME[k]) + ', ' + quoted(SHAPE_RULE[k]));
    }
  });
  it('says every other problem in the same words', () => {
    for (const w of [WORDS.unknownKind, WORDS.badId, WORDS.sameId, WORDS.noLesson, WORDS.lessonsFirst, WORDS.tooManyLessons, WORDS.tooBig, WORDS.noScoredBlock]) {
      expect(sql, w).toContain(quoted(w));
    }
    for (const w of [WORDS.sortGroup, WORDS.branchGood]) expect(sql, w).toContain(': ' + w + "'"); // after 'Lesson N · name'
    expect(sql).toContain("'Lesson ' || ");
    expect(sql).toContain(' has more than ' + COURSE_CAPS.blocksPerLesson + ' blocks');
    expect(sql).toContain(' has no blocks yet');
    expect(sql).toContain("'Add at least 2 lessons'");
  });
  it('decides completion and hours as courseRule and courseHours do', () => {
    expect(sql).toContain("p_shape ->> " + quoted(COMPLETION_QUESTION));
    for (const [answer, rule] of Object.entries(COURSE_RULES)) {
      if (rule === 'seen') continue;
      expect(sql).toContain('when ' + quoted(answer) + ' then ' + quoted(rule));
    }
    expect(sql).toContain("p_shape ->> " + quoted(COURSE_LENGTH));
    const cases = Object.fromEntries(Array.from(sql.matchAll(/when '([0-9]+ min)' then ([0-9.]+)/g), (m) => [m[1], +m[2]]));
    expect(cases).toEqual(COURSE_HOURS);
    expect(sql).toContain('else ' + COURSE_HOURS['30 min'] + ' end');
  });
  it('publishes the course hours and keeps the Explainer and the other formats as they were', () => {
    expect(sql).toContain("when 'E-learning' then private.course_hours(c.shape)");
    expect(sql).toContain("when 'E-learning' then private.course_content(p_items, p_shape)");
    expect(sql).toContain("when p_type = 'E-learning' then private.course_ok(p_items)");
    expect(sql).toContain("if c.type = 'E-learning' and c.studio is not null");
    for (const f of ['Avatar', 'Reel', 'Interactive explainer', 'Animated flow', 'Case exercise']) expect(sql).toContain("'" + f + "'");
  });
  it('knows the embed formats, the learning id and the embed sentences as embedProblems says them', () => {
    expect(embedSql).toContain('in (' + EMBED_FORMATS.map((f) => quoted(f)).join(', ') + ')');
    expect(embedSql).toContain(quoted('^' + EMBED_LEARNING.source.slice(1)));
    expect(embedSql).toContain(': pick the learning from the library');
    expect(embedSql).toContain(': the learning picked is not available: pick another');
    const items = [{ block: 'embed', id: 'b0001', lesson: 1, format: 'Reel', learning: '' }, { block: 'embed', id: 'b0002', lesson: 1, format: 'Reel', learning: 'L9' }];
    expect(embedProblems(items, () => false)).toEqual(['Lesson 2 · Reel: pick the learning from the library', 'Lesson 2 · Reel: the learning picked is not available: pick another']);
  });
  it('locks down every new function', () => {
    const created = Array.from(sql.matchAll(/create function private\.(course_[a-z_]+)\(([^)]*)\)/g), (m) => m[1]);
    expect(created.length).toBeGreaterThan(5);
    for (const f of created) expect(sql, f).toMatch(new RegExp('revoke execute on function [^;]*private\\.' + f + '\\('));
  });
});
