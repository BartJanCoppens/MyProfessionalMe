// Reflections are private to the learner (Task 1.5): the table's only readers are its own four owner-only policies. This reads every migration so that a
// later function, view or policy that touches course_reflections cannot leak it unnoticed, and keeps the length cap in TypeScript and SQL equal.
import { describe, expect, it } from 'vitest';
import { REFLECTION_MAX } from '../lib/reflectionStore';

const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const OWN = '20261119110000_course_reflections.sql';
const named = (f: string) => f.split('/').pop()!;
const code = (name: string) => migrations[Object.keys(migrations).find((f) => named(f) === name)!].replace(/--.*$/gm, '');

describe('reflections: private to the learner', () => {
  it('course_reflections appears in no migration but its own', () => {
    const others = Object.keys(migrations).filter((f) => named(f) !== OWN && /course_reflections/.test(migrations[f])).map(named);
    expect(others).toEqual([]);
  });
  it('its own migration has four policies, each on the owner, and no admin, counsellor or can_view branch', () => {
    const sql = code(OWN);
    const policies = sql.split('create policy').slice(1);
    expect(policies).toHaveLength(4);
    for (const p of policies) expect(p).toMatch(/user_id = \(select auth\.uid\(\)\)/);
    expect(sql).not.toMatch(/can_view|is_admin|counsellor|security definer[\s\S]*from public\.course_reflections/);
    expect(sql).toMatch(/revoke all on public\.course_reflections from anon, authenticated/);
  });
  it('REFLECTION_MAX equals the length check on the raw text, with the one trim rule for blank', () => {
    expect(code(OWN)).toContain('char_length(p_text) <= ' + REFLECTION_MAX + " and private.trimmed(p_text) <> ''");
  });
});
