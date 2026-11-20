// @vitest-environment jsdom
// AI help in the course editor on screen: the actions for a creator, none in View as, and an honest message when it cannot run.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Live } from '../test/courseEditorLive';
import { click } from '../test/courseEditorFixtures';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('AI help in Produce', () => {
  it('offers the lesson, all-lessons and per-block actions, and says what they do', () => {
    render(<Live />);
    expect(screen.getByRole('button', { name: 'Draft blocks with AI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Draft all lessons with AI' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Suggest .* with AI$/ })).toHaveLength(8);
    expect(screen.getByText('Drafts blocks from your sources · review each one')).toBeTruthy();
  });
  it('says why when it cannot run, and adds nothing', () => {
    render(<Live />);
    click('Draft blocks with AI');
    expect(screen.getByText('2 lessons · 4 blocks · 1 scored')).toBeTruthy();
  });
  it('View as shows no AI action', () => {
    render(<Live readOnly />);
    expect(screen.queryByRole('button', { name: /with AI/ })).toBeNull();
  });
});
