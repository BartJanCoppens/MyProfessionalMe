// What the Create & share store sends to Supabase for the studio check (FT-STORE-*). The client is a fake.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, has, op } from '../test/fakeSupabase';
import { checkContribution, removeDraft, saveDraft } from './contributionStore';
import type { DraftFields } from './contributionStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));
beforeEach(() => db.reset());

const fields: DraftFields = { business_line: 'Consulting', audience: null, type: 'Flash cards', title: 'T', domain: 'reg', level: 2, audience_stage: 'Analyst', takeaway: 'x',
  outline: '', sources: [], ai_assisted: false, bundle_ids: [], items: [['F', 'B']], shape: null };

describe('saving a draft', () => {
  it('says a format made in a studio is not made with the upload form, instead of the raw constraint', async () => {
    db.answer(() => ({ error: { code: '23514', message: 'new row for relation "contributions" violates check constraint "contributions_upload_formats"' } }));
    await expect(saveDraft({ ...fields, type: 'Game' })).rejects.toThrow('This format is made in its studio, not with the upload form.');
  });
});

describe('the automatic check', () => {
  it('calls check_contribution with the id and passes on no reasons', async () => {
    db.answer(() => ({ data: [] }));
    expect(await checkContribution('c1')).toEqual({ passed: true, reasons: [] });
    expect(db.calls[0]).toEqual({ table: 'rpc:check_contribution', steps: [['args', [{ p_id: 'c1' }]]] });
  });
  it('returns the reasons of a failed check', async () => {
    db.answer(() => ({ data: ['Add at least 4 items', '“Delcroix” looks like a client name · anonymise it'] }));
    expect(await checkContribution('c1')).toEqual({ passed: false, reasons: ['Add at least 4 items', '“Delcroix” looks like a client name · anonymise it'] });
  });
  it('never passes on an answer that is not a list, and throws the database refusal', async () => {
    db.answer(() => ({ data: null }));
    expect(await checkContribution('c1')).toEqual({ passed: false, reasons: ['The check gave no answer · try again'] });
    db.answer(() => ({ error: { message: 'Contribution not found' } }));
    await expect(checkContribution('c1')).rejects.toThrow('Contribution not found');
  });
});

describe('saving a studio draft', () => {
  it('inserts the studio with a new draft', async () => {
    db.answer(() => ({ data: { id: 'new1' } }));
    expect(await saveDraft({ ...fields, studio: 'flash' })).toBe('new1');
    const [c] = db.on('contributions');
    expect(op(c)).toBe('insert');
    expect(c.steps[0][1][0]).toMatchObject({ studio: 'flash', type: 'Flash cards' });
  });
});

describe('deleting a draft', () => {
  const USER = '0f8fad5b-d9cb-469f-a165-70867728950e', ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  beforeEach(() => db.client.auth.getSession.mockImplementation(async () => ({ data: { session: { user: { id: USER } } } })));
  const answers = (status: string | null, files: string[], removed = files.length) => db.answer((c) =>
    c.table === 'contributions' && op(c) === 'select' ? { data: status ? { status } : null }
      : op(c) === 'list' ? { data: files.map((name) => ({ name })) }
        : op(c) === 'remove' ? { data: Array(removed).fill({}) } : { data: [{ id: ID }] });
  it('removes the draft\'s files first, then the row', async () => {
    answers('draft', ['a.mp3']);
    await removeDraft(ID);
    expect(db.calls.map((c) => c.table + ':' + op(c))).toEqual(['contributions:select', 'storage:media:list', 'storage:media:remove', 'contributions:delete']);
    expect(has(db.calls[3], 'eq', 'id', ID)).toBe(true);
  });
  it('touches no file of a contribution with changes requested (only a draft is deleted)', async () => {
    answers('changes', ['a.mp3']);
    await expect(removeDraft(ID)).rejects.toThrow('Only a draft can be deleted');
    expect(db.calls.map((c) => c.table)).toEqual(['contributions']);
  });
  it('keeps the draft when its files could not be removed, and says so', async () => {
    answers('draft', ['a.mp3', 'b.mp3'], 1);
    await expect(removeDraft(ID)).rejects.toThrow('Not deleted · its files could not all be removed; try again');
    expect(db.calls.some((c) => op(c) === 'delete')).toBe(false);
  });
});

