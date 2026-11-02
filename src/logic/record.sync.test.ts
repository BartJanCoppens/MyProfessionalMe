// The completion and evidence rules exist twice: in TypeScript (record.ts) and in the database functions. This test
// reads the latest migration that defines each function and compares its format lists and thresholds with the TS rule
// tables, so the two cannot drift apart.
import { describe, expect, it } from 'vitest';
import { CERTIFICATE_FORMATS, COMPLETION, FEEDBACK_MIN, REFLECTION_FORMATS, REFLECTION_MIN, SELF_COMPLETE } from './record';

// Every migration, as text, keyed by path (the timestamped names sort in order).
const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(migrations).sort();

// The body of the latest definition of a function, up to its closing $$.
function latest(fn: string): { file: string; body: string } {
  const re = new RegExp('create (or replace )?function ' + fn.replace('.', '\\.') + '\\(');
  for (const f of files.slice().reverse()) {
    const sql = migrations[f], m = re.exec(sql);
    if (!m) continue;
    const start = sql.indexOf('$$', m.index), end = sql.indexOf('$$', start + 2);
    return { file: f.split('/').pop()!, body: sql.slice(start + 2, end) };
  }
  throw new Error('no migration defines ' + fn);
}
// The quoted formats in the first "<lead> in (…)" of a body, or the formats compared with "=".
const listAfter = (body: string, lead: RegExp) => {
  const m = new RegExp(lead.source + '\\s*in\\s*\\(([^)]*)\\)').exec(body) || new RegExp(lead.source + "\\s*=\\s*('[^']*')").exec(body);
  if (!m) throw new Error('no list after ' + lead.source);
  return Array.from(m[1].matchAll(/'([^']*)'/g), (x) => x[1]).sort();
};
const sorted = (a: string[]) => a.slice().sort();

describe('completion and evidence rules: TypeScript and the database agree', () => {
  it('self-completing formats match private.is_self_complete()', () => {
    const { body } = latest('private.is_self_complete');
    expect(listAfter(body, /format/)).toEqual(sorted(SELF_COMPLETE));
    expect(body).toMatch(/status = 'published'/);
  });
  it('formats that complete with feedback match private.completion_rule()', () => {
    const { body } = latest('private.completion_rule');
    expect(body).toMatch(/then 'feedback'/);
    expect(listAfter(body, /p_format/)).toEqual(sorted(Object.keys(COMPLETION).filter((f) => COMPLETION[f] === 'feedback')));
  });
  it('the feedback minimum matches private.completion_ok()', () => {
    const { body } = latest('private.completion_ok');
    expect(body).toMatch(new RegExp('>= ' + FEEDBACK_MIN + '\\b'));
    expect(body).toMatch(/between 1 and 5/);
  });
  it('certificate and reflection formats match private.evidence_rule(), and the reflection minimum private.evidence_ok()', () => {
    const rule = latest('private.evidence_rule').body;
    const cert = /when p_format = '([^']*)' then 'certificate'/.exec(rule);
    expect(cert ? [cert[1]] : listAfter(rule.split("'certificate'")[0], /p_format/)).toEqual(sorted(CERTIFICATE_FORMATS));
    expect(listAfter(rule.split("'certificate'")[1], /p_format/)).toEqual(sorted(REFLECTION_FORMATS));
    expect(latest('private.evidence_ok').body).toMatch(new RegExp('>= ' + REFLECTION_MIN + '\\b'));
  });
  it('no format both completes itself and needs evidence for acceptance', () => {
    expect(SELF_COMPLETE.filter((f) => CERTIFICATE_FORMATS.includes(f) || REFLECTION_FORMATS.includes(f))).toEqual([]);
  });
});
