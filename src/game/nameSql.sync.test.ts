// private.first_and_initial (SQL) repeats firstNameInitial (TypeScript): the same samples go through both. The samples are the
// literals of the GR case in supabase/tests/rls.sql (run on PGlite and the live project); the whitespace set is the one
// JavaScript trims and splits on, held once in the database as private.js_space() (private.trimmed uses it too).
import { describe, expect, it } from 'vitest';
import { migrationText } from '../test/migrations';
import { firstNameInitial } from './protocol';

export const SAMPLES: string[] = ['Jan Peeters', 'Jan Peeters', '\tJan Peeters', '\t', '   ', '', 'a@b.test', 'Jan <jan@x.test>', 'Cher', 'Jan van　Peeters', '﻿Jan Peeters﻿', ' ann  de vries '];
const literal = (s: string) => "E'" + [...s].map((c) => (c.charCodeAt(0) > 0x20 && c.charCodeAt(0) < 0x7f ? c : c === ' ' ? ' ' : '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))).join('') + "'";
const rls = Object.values(import.meta.glob('../../supabase/tests/rls.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];
const sql = migrationText('20261118110000_game_runs.sql');

describe('first_and_initial matches firstNameInitial', () => {
  it.each(SAMPLES.map((s) => [JSON.stringify(s), s] as const))('%s: the same answer in the GR case', (_n, s) => {
    expect(rls).toContain(`(${literal(s)}, '${firstNameInitial(s)}')`);
  });
  it('the database set of spaces is exactly what JavaScript treats as whitespace', () => {
    const js = Array.from({ length: 0x10000 }, (_, i) => String.fromCharCode(i)).filter((c) => /\s/.test(c)).map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    expect(sql).toContain("E'" + js + "'");
  });
  it('splits and trims on that set, not on Postgres \\s', () => {
    const body = /create function private\.first_and_initial[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)![1];
    expect(body).toContain('private.trimmed(p_name)');
    expect(body).toContain('private.js_space()');
    expect(body).not.toContain('\\s');
  });
});
