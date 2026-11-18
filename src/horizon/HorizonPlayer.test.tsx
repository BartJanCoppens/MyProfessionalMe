// @vitest-environment jsdom
// The Horizon player (studios plan, Task 3.3): the file loaded through the media adapter, the slides along the route,
// the last slide told once (completion), a file that cannot be read said in words, the narration on the shared step
// player moving the slides, and nothing loaded from outside the file (Review Focus 6).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import garden from './fixtures/Garden tour.horizon?raw';
import { crafted } from '../test/horizonDecks';
import HorizonPlayer from './HorizonPlayer';

const mediaText = vi.fn();
vi.mock('../lib/mediaStore', () => ({ mediaText: (p: string) => mediaText(p) }));
beforeEach(() => { mediaText.mockReset(); });
afterEach(cleanup);
const PATH = 'u/c/presentation.horizon';
const open = async (text: string, onLast = vi.fn()) => {
  mediaText.mockResolvedValue(text);
  const r = render(<HorizonPlayer path={PATH} still={false} onLast={onLast} />);
  await screen.findByText(/Slide 1 of/);
  return { ...r, onLast };
};

describe('the Horizon player', () => {
  it('loads the file through the media adapter and shows the first slide of the route', async () => {
    mediaText.mockResolvedValue(garden);
    render(<HorizonPlayer path={PATH} still={false} />);
    expect(screen.getByText('Loading the presentation')).toBeTruthy();
    expect(await screen.findByText('Slide 1 of 3 · Welcome to the garden')).toBeTruthy();
    expect(mediaText).toHaveBeenCalledWith(PATH);
  });
  it('goes to the next and previous slide, with buttons and keys', async () => {
    await open(garden);
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByText('Slide 2 of 3 · What grows where')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('region', { name: 'Presentation' }), { key: 'ArrowLeft' });
    expect(screen.getByText('Slide 1 of 3 · Welcome to the garden')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Previous slide' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('tells the last slide once (completion)', async () => {
    const { onLast } = await open(garden);
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(onLast).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Next slide' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/End of the presentation/)).toBeTruthy();
  });
  it('says why a file cannot be played', async () => {
    mediaText.mockResolvedValue('{"format":"horizon","version":7,"frames":[]}');
    render(<HorizonPlayer path={PATH} still={false} />);
    expect(await screen.findByText('Made with a newer Horizon (file version 7) · this player reads version 1')).toBeTruthy();
    mediaText.mockImplementation(async () => { throw new Error('This file is not there, or not open to you'); });
    cleanup();
    render(<HorizonPlayer path={PATH} still={false} />);
    expect(await screen.findByText('This file is not there, or not open to you')).toBeTruthy();
  });
  it('fades from slide to slide with motion off', async () => {
    mediaText.mockResolvedValue(garden);
    const { container } = render(<HorizonPlayer path={PATH} still />);
    await screen.findByText(/Slide 1 of/);
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(container.querySelector('[data-stage]')!.getAttribute('data-stage')).toBe('fade');
  });
});

describe('a hostile file in the player (Review Focus 6)', () => {
  it('loads nothing from outside the file and runs nothing from it', async () => {
    const { container } = await open(JSON.stringify(crafted));
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(container.querySelector('iframe, script, object, embed')).toBeNull();
    const addresses = [...container.querySelectorAll('*')].flatMap((el) => [...el.attributes].filter((a) => /^(src|href|xlink:href|poster)$/i.test(a.name)).map((a) => a.value));
    addresses.forEach((a) => expect(a).toMatch(/^(data:|#)/));
    expect(container.innerHTML).not.toMatch(/evil\.example|onclick|postMessage/);
  });
});

describe('the narration', () => {
  it('plays on the shared step player and moves the slides with it; the voice is marked as made with AI', async () => {
    await open(JSON.stringify(crafted));
    fireEvent.click(screen.getByRole('button', { name: 'Play the narration' }));
    expect(screen.getByText(/Step 1 of 2/)).toBeTruthy();
    expect(screen.getByText('Narrated with an AI voice, made in Horizon · Short tour')).toBeTruthy();
    expect(screen.getByText('Hello and on.')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); });
    expect(screen.getByText(/Step 2 of 2/)).toBeTruthy();
    expect(screen.getByText('Slide 2 of 2 · Second')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Present it yourself' }));
    expect(screen.queryByText(/Step 2 of 2/)).toBeNull();
  });
});

describe('what only Horizon runs is said on the page', () => {
  const frame = { id: 'a', x: 0, y: 0, next: [], title: 'A', body: '', viz: null, layout: 'blank',
    objects: [{ id: 'av', kind: 'avatar', x: 10, y: 10, w: 200, h: 200, avatar: { mode: 'live', look: { name: 'Guide' }, speaks: 'arrival' } }] };
  const passage = (key: string) => ({ id: 'p', part: 'a', text: 'Hello there', audio: { key, seconds: 3, marks: [] } });
  const deck = { format: 'horizon', version: 1, title: 'T', theme: { world: 'space' }, frames: [frame], media: {},
    narratives: { items: [{ id: 'n1', name: 'One', passages: [passage('constructor')] }, { id: 'n2', name: 'Two', passages: [passage('k')] }] } };
  it('shows a conversation avatar as a placeholder, a 3D scene as flat, and the first of several narrations', async () => {
    await open(JSON.stringify(deck));
    expect(screen.getByText('Conversation runs in Horizon')).toBeTruthy();
    expect(screen.getByText(/shown flat/)).toBeTruthy();
    expect(screen.getByText('This deck has 2 narrations; the first plays here.')).toBeTruthy();
    expect(screen.queryByText('This deck has 1 narrations; the first plays here.')).toBeNull();
  });
  it('does not call a narration voiced when its audio key is only an object\'s own member', async () => {
    await open(JSON.stringify(deck));
    fireEvent.click(screen.getByRole('button', { name: 'Play the narration' }));
    expect(screen.getByText(/No voice in the file/)).toBeTruthy();
    expect(screen.queryByText(/AI voice/)).toBeNull();
  });
  it('says nothing of it for a plain deck (the Garden tour does use a globe, so it says it is flat)', async () => {
    await open(JSON.stringify({ format: 'horizon', version: 1, title: 'T', frames: [{ id: 'a', title: 'A' }] }));
    expect(screen.queryByText(/shown flat|narrations;/)).toBeNull();
  });
});
