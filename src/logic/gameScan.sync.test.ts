// The game scan runs in the browser (gameScan.ts) and in the database (private.game_scan), so a crafted write is refused too.
// The rule list is written once in TypeScript; the migration repeats each pattern with \b written as \y (and its ' doubled),
// with the case-insensitive flag, and the same file limits.
import { describe, expect, it } from 'vitest';
import { migrationText } from '../test/migrations';
import { FILE_NAMES, GAME_FILE_MAX, RULES } from './gameScan';

const sql = migrationText('20261118100000_game_studio.sql');
const body = (fn: string) => new RegExp('create (?:or replace )?function private\\.' + fn + '\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$').exec(sql)![1];
const translated = (source: string) => source.replace(/\\b/g, '\\y').replace(/'/g, "''");

describe('private.game_scan repeats the rules of scanGameFiles', () => {
  const scan = body('game_scan');
  it.each(RULES.map((r) => [r.what, r] as const))('%s: the pattern, translated, with its flag', (_what, rule) => {
    expect(scan).toContain(`('${rule.what}', '${translated(rule.pattern.source)}', ${rule.pattern.ignoreCase})`);
  });
  it('has no rule the TypeScript does not have', () => expect(scan.match(/^\s+\('[^']+', '/gm)).toHaveLength(RULES.length));
  it('says the same things about the files', () => {
    expect(scan).toContain("'The game has no index.html'");
    expect(scan).toContain("'%s is too large (over %s characters)'");
    expect(scan).toContain("'%s %s (%s)'");
    expect(scan).toContain('left(private.trimmed(v_found[1]), 40)');
    FILE_NAMES.forEach((n) => { expect(scan).toContain(`'${n}'`); expect(scan).toContain(String(GAME_FILE_MAX[n])); });
  });
});

describe('private.game_item_ok repeats the file limits', () => {
  it('16000 and 32000 characters, the two names', () => {
    const b = body('game_item_ok');
    expect(b).toContain(String(GAME_FILE_MAX['index.html']));
    expect(b).toContain(String(GAME_FILE_MAX['game.js']));
    FILE_NAMES.forEach((n) => expect(b).toContain(`'${n}'`));
  });
});
