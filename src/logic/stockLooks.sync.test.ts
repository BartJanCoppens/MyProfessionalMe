// public.stock_looks repeats the bundled portrait list and the field limits; its seeds are the roles the studios had built in.
import { describe, expect, it } from 'vitest';
import { migrationText } from '../test/migrations';
import { PORTRAITS, PORTRAIT_KEYS } from '../reel/portraits';
import { DRAWN_LICENCE, blankLook, lookOf, stockLookProblem } from './stockLooks';

const sql = migrationText('20261118170000_stock_looks.sql');

describe('public.stock_looks repeats the TypeScript rules', () => {
  it('checks the portrait against the bundled list', () => {
    const list = /portrait in \(([^)]*)\)/.exec(sql)![1].split(',').map((k) => k.trim().replace(/'/g, ''));
    expect(list).toEqual(PORTRAIT_KEYS);
    expect(Object.keys(PORTRAITS)).toEqual(PORTRAIT_KEYS);
  });
  it('has the same limits', () => {
    expect(sql).toContain('length(trim(name)) between 1 and 80');
    expect(sql).toContain('length(trim(licence)) between 1 and 200');
    expect(sql).toContain("color ~ '^#[0-9a-f]{6}$'");
  });
  it('seeds the four roles the studios had, drawn in code', () => {
    const seeds = [...sql.matchAll(/^\s+\('([^']+)', '(p\d)', '(#[0-9a-f]{6})', '([^']+)'\)/gm)].map((m) => [m[1], m[2], m[3], m[4]]);
    expect(seeds).toEqual([
      ['HR director · 50s', 'p1', '#8a5a8c', DRAWN_LICENCE], ['CFO · 40s', 'p2', '#2f7fc1', DRAWN_LICENCE],
      ['Consultant · 30s', 'p3', '#4c7a10', DRAWN_LICENCE], ['Engineer · 50s', 'p4', '#b5762a', DRAWN_LICENCE],
    ]);
  });
  it('grants no delete and no upload column', () => {
    expect(sql).not.toMatch(/grant[^;]*delete/i);
    const table = /create table public\.stock_looks \(([\s\S]*?)\n\);/.exec(sql)![1];
    expect(table.match(/^\s+(\w+) /gm)!.map((c) => c.trim().split(' ')[0])).toEqual(['id', 'name', 'portrait', 'color', 'licence', 'active', 'created_at']);
  });
});

describe('stockLookProblem', () => {
  const ok = { ...blankLook(), name: 'CFO · 40s' };
  it('accepts a role, a portrait, a colour and a licence', () => expect(stockLookProblem(ok)).toBeNull());
  it('refuses what the table refuses', () => {
    expect(stockLookProblem({ ...ok, name: ' ' })).toMatch(/Name the look/);
    expect(stockLookProblem({ ...ok, portrait: 'p9' as never })).toMatch(/drawn portraits/);
    expect(stockLookProblem({ ...ok, color: 'red' })).toMatch(/six hex digits/);
    expect(stockLookProblem({ ...ok, licence: '' })).toMatch(/Say where/);
  });
  it('finds a look by its role', () => {
    const looks = [{ id: 'l1', ...ok, active: true }];
    expect(lookOf(looks, 'CFO · 40s')?.id).toBe('l1');
    expect(lookOf(looks, 'Nobody')).toBeUndefined();
  });
});
