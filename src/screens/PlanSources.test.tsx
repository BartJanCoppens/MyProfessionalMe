// @vitest-environment jsdom
// The sources block of a trajectory plan, read from the panel the view-model builds (the add and remove flows are tested in
// trajectoryAiSources.test.ts against the store): what is listed, the honest notes, and what View as does not show.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, person, systemAdmin } from '../test/harness';
import type { PlanSource } from '../logic/trajectoryPlan';
import { sourcesPanel } from '../trajectoryAiSources';
import PlanSources from './PlanSources';

afterEach(cleanup);
const USER = 'u1';
const src = (over: Partial<PlanSource> = {}): PlanSource => ({ id: 's1', trajectoryId: 'T', name: 'syllabus.pdf', path: 'u/s1/syllabus.pdf', pages: 12, passages: Array.from({ length: 31 }, () => [1, 'x'] as [number, string]), chars: 100, flags: [], addedBy: USER, addedAt: '', ...over });
const panelOf = (sources: PlanSource[], error: string | null = null, readOnly = false) => {
  const h = harness({ subject: person({ id: readOnly ? 'other' : USER, readOnly }), access: systemAdmin(USER), state: { trjPlans: { T: { record: null, sources } }, trjAi: { busy: null, error } } });
  return sourcesPanel(h.L(), 'T');
};

describe('PlanSources', () => {
  it('lists a source with its page and passage counts and who added it, and states the limits', () => {
    render(<PlanSources p={panelOf([src()])} />);
    expect(screen.getByText('syllabus.pdf · 12 pages · 31 passages')).toBeTruthy();
    expect(screen.getByText('Added by you')).toBeTruthy();
    expect(screen.getByText(/PDF only, up to 20 MB and 400 pages\. The text is read in your browser; scanned PDFs are not read\. Upload only documents the firm may use for training/)).toBeTruthy();
    expect(screen.getByText('Each message sends the plan, the last messages and at most 24 matching or cited passages, never a whole document.')).toBeTruthy();
  });
  it('says a document was cut, flagged, or kept without its file', () => {
    render(<PlanSources p={panelOf([src({ id: 'a', flags: ['cut_pages'] }), src({ id: 'b', flags: ['cut_text', 'meta_or_injection'], path: null })])} />);
    expect(screen.getByText('Read the first 400 pages only')).toBeTruthy();
    expect(screen.getByText('Read the first 400,000 characters only')).toBeTruthy();
    expect(screen.getByText('Contains text that reads like instructions to an AI · treated as data only')).toBeTruthy();
    expect(screen.getByText('Original file not stored')).toBeTruthy();
  });
  it('shows why a file was refused', () => {
    render(<PlanSources p={panelOf([], 'At most 10 sources per trajectory')} />);
    expect(screen.getByRole('alert').textContent).toBe('At most 10 sources per trajectory');
  });
  it('hands the picked file to the view-model, and a remove to the source', () => {
    const p = { ...panelOf([src()]), add: vi.fn() };
    render(<PlanSources p={p} />);
    fireEvent.change(screen.getByLabelText('PDF source'), { target: { files: [new File(['x'], 'a.pdf')] } });
    expect(p.add).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('PDF source') as HTMLInputElement).accept).toBe('application/pdf,.pdf');
    expect(screen.getByText('Remove')).toBeTruthy();
  });
  it('View as shows the list with no Add or Remove', () => {
    render(<PlanSources p={panelOf([src()], null, true)} />);
    expect(screen.getByText('syllabus.pdf · 12 pages · 31 passages')).toBeTruthy();
    expect(screen.queryByLabelText('PDF source')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
  });
});
