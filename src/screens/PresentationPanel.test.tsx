// @vitest-environment jsdom
// A Presentation's panel (studios plan, Task 3.3): one panel for the learner's detail page and for the author and
// reviewers (the registry in studioPreviews.tsx), the Horizon player inside, completion through the view-model.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import garden from '../horizon/fixtures/Garden tour.horizon?raw';
import { horizonView } from '../fmtHorizon';
import type { HorizonContent } from '../types';
import PresentationPanel from './PresentationPanel';
import { SavedContent } from './studioPreviews';

vi.mock('../lib/mediaStore', () => ({ mediaText: vi.fn(async () => garden) }));
afterEach(cleanup);
const PATH = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/presentation.horizon';
const content: HorizonContent = { kind: 'horizon', path: PATH, title: 'Garden tour', slides: 3, seconds: 0 };

describe('the Presentation panel', () => {
  it('plays the file and tells the view-model when the last slide is reached', async () => {
    const onLast = vi.fn();
    render(<PresentationPanel hz={horizonView(content, { ro: false, still: false, done: false, onLast })} />);
    expect(screen.getByText('Play the presentation')).toBeTruthy();
    expect(screen.getByText('3 slides · counts 0.25 h · Horizon presentation')).toBeTruthy();
    await screen.findByText(/Slide 1 of 3/);
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(onLast).toHaveBeenCalledTimes(1);
  });
  it('is what the author and reviewers see of a saved Presentation, where playing completes nothing', async () => {
    render(<SavedContent t={{ key: 'c1', content, hours: 0, still: false }} />);
    expect(screen.getByText('As learners will see it')).toBeTruthy();
    expect(await screen.findByText('Slide 1 of 3 · Welcome to the garden')).toBeTruthy();
  });
});
