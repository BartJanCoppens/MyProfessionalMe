// The house-rules verdict is server-owned (migration 20261118130000): the built game item holds exactly kind, files and for, and the check gate
// reads game_reviews. The words and limits the browser repeats (gameContent.ts) are those of the migration.
import { describe, expect, it } from 'vitest';
import { migrationText } from '../test/migrations';
import { GAME_FILE_MAX } from './gameScan';
import { NOT_PASSED, RERUN, reviewProblem } from './gameContent';

const sql = migrationText('20261118130000_game_review.sql');
const fn = (name: string) => new RegExp('create (?:or replace )?function (?:private|public)\\.' + name + '\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$').exec(sql)![1];

describe('the built game item in SQL and TypeScript', () => {
  const item = fn('game_item_ok');
  it('has exactly kind, files and for: a client-sent review or made is refused', () => {
    expect(item).toContain("<> 3 or not (e ?& array['kind', 'files', 'for'])");
    expect(item).not.toMatch(/'review'|'made'/);
  });
  it('keeps the file limits', () => expect(item).toContain(`> ${GAME_FILE_MAX['index.html']} or char_length(e -> 'files' ->> 'game.js') > ${GAME_FILE_MAX['game.js']}`));
});

describe('the check gate reads the verdict for everything the review read, as it is now', () => {
  const problems = sql.slice(sql.indexOf('function private.contribution_problems'));
  it('says the same things as reviewProblem', () => {
    expect(problems).toContain(`'${NOT_PASSED}'`);
    expect(problems).toContain(`'${RERUN}'`);
    expect(problems).toContain("'The house-rules check has not passed' || coalesce(': ' || nullif(v_review.reasons[1], ''), '')");
    expect(reviewProblem({ passed: false, reasons: ['a'], current: true })).toEqual([NOT_PASSED + ': a']);
  });
  it('compares the stored hash with the hash of the current items, in SQL only', () => {
    expect(problems).toContain('v_review.files_hash is distinct from private.game_review_hash(c.title, c.items, c.shape)');
    expect(fn('game_review_hash')).toContain('sha256(');
    // one basis for the hash and for what the model reads: the title and the game's content
    expect(fn('game_review_basis')).toContain("jsonb_build_object('title', p_title, 'content', private.game_content(p_items, p_shape))");
    expect(fn('game_review_input')).toContain('private.game_review_basis(c.title, c.items, c.shape)');
  });
});
