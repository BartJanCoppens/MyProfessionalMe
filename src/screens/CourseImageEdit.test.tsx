// @vitest-environment jsdom
// Pictures in the course editor (E-learning Studio, Task 2.3): the shelf, the file picker that saves the draft first, the alt text, a hotspot's points, and the
// files left behind by a removed or replaced image.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../lib/contributionStore';
import * as media from '../lib/mediaStore';
import type { CourseBlock } from '../logic/courseContent';
import { Live } from '../test/courseEditorLive';
import { ITEMS, click, data } from '../test/courseEditorFixtures';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
const FOLDER = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/';
vi.mock('../lib/mediaStore', () => ({ uploadMedia: vi.fn(), removePaths: vi.fn(async () => {}), mediaUrl: vi.fn(async (p: string) => 'https://signed.test/' + p) }));

const picture = (extra: Record<string, unknown> = {}): CourseBlock => ({ block: 'image', id: 'b0050', lesson: 0, path: FOLDER + 'b0050.png', alt: 'An invoice', cap: '', ...extra }) as CourseBlock;
const file = (name: string, bytes = 10, type = 'image/png') => new File([new Uint8Array(bytes)], name, { type });
const choose = (label: string, f: File) => fireEvent.change(screen.getByLabelText(label), { target: { files: [f] } });
const shelf = (group: string, name: RegExp) => fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('button', { name }));

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.mocked(store.saveDraft).mockResolvedValue('c1'); vi.mocked(store.loadCreate).mockResolvedValue(data());
  vi.mocked(media.uploadMedia).mockImplementation(async (_id, _f, name) => FOLDER + name);
});
afterEach(cleanup);

describe('the shelf and the block', () => {
  it('offers Image among the blocks and Hotspot image among the interactions', () => {
    render(<Live />);
    expect(within(screen.getByRole('group', { name: 'Blocks' })).getByRole('button', { name: /Image/ })).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Interactions' })).getByRole('button', { name: /Hotspot image/ })).toBeTruthy();
  });
  it('a new image says "Add an image" with no placeholder picture, asks for alt text and lists what is missing', () => {
    render(<Live />);
    shelf('Blocks', /Image/);
    expect(screen.getByLabelText('Add an image').getAttribute('type')).toBe('file');
    expect(screen.getByLabelText('Add an image').getAttribute('accept')).toBe('image/png,image/jpeg,image/webp');
    expect(screen.getByText('PNG, JPEG or WebP, up to 5 MB')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select image' }).textContent).toContain('Add an image');
    expect(screen.getByText('No alt text yet')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Alt text (read aloud by screen readers)' }).getAttribute('maxlength')).toBe('600');
    expect(screen.getByText('Lesson 1 · Image: add the image')).toBeTruthy();
    expect(screen.getByText('Lesson 1 · Image: write the alt text (read aloud by screen readers)')).toBeTruthy();
  });
  it('typing the alt text clears the tag and its problem', () => {
    render(<Live />);
    shelf('Blocks', /Image/);
    fireEvent.change(screen.getByRole('textbox', { name: 'Alt text (read aloud by screen readers)' }), { target: { value: 'A Belgian invoice' } });
    expect(screen.queryByText('No alt text yet')).toBeNull();
    expect(screen.queryByText('Lesson 1 · Image: write the alt text (read aloud by screen readers)')).toBeNull();
  });
});

describe('choosing the file', () => {
  it('saves the unsaved draft first, stores the file in its folder under the block\'s name and names it in the block', async () => {
    render(<Live />);
    shelf('Blocks', /Image/);
    choose('Add an image', file('Invoice (final).PNG'));
    await waitFor(() => expect(document.querySelector('img')).toBeTruthy()); // an empty alt text makes it a decoration, not role img
    const [id, sent, name] = vi.mocked(media.uploadMedia).mock.calls[0];
    expect([id, (sent as File).name, name]).toEqual(['c1', 'Invoice (final).PNG', expect.stringMatching(/^b[0-9a-z]{10}-[0-9a-z]{6}\.png$/)]);
    expect(vi.mocked(store.saveDraft).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(media.uploadMedia).mock.invocationCallOrder[0]);
    expect(vi.mocked(store.saveDraft)).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(store.saveDraft).mock.calls[1][0].items as CourseBlock[];
    expect(saved.find((x) => !Array.isArray(x) && (x as CourseBlock).block === 'image')).toMatchObject({ path: FOLDER + name });
    expect(screen.getByLabelText('Replace the image')).toBeTruthy();
    expect(screen.queryByText('Lesson 1 · Image: add the image')).toBeNull();
  });
  it('refuses a file that is not an image, or is too large, before anything is saved or stored', () => {
    render(<Live />);
    shelf('Blocks', /Image/);
    choose('Add an image', file('logo.svg', 10, 'image/svg+xml'));
    expect(screen.getByRole('status').textContent).toBe('Only .png, .jpg, .jpeg and .webp images can be added');
    choose('Add an image', file('big.png', 6 * 1024 * 1024));
    expect(screen.getByRole('status').textContent).toBe('An image is at most 5 MB · this one is 6.0 MB');
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(media.uploadMedia).not.toHaveBeenCalled();
  });
  it('keeps the old file when the upload fails, and says why', async () => {
    vi.mocked(media.uploadMedia).mockRejectedValue(new Error('Not allowed · files change only while your contribution is a draft or has changes requested'));
    render(<Live items={[...ITEMS, picture()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select image' }));
    choose('Replace the image', file('other.jpg', 10, 'image/jpeg'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Not allowed/));
    expect(media.removePaths).not.toHaveBeenCalled();
  });
  it('replacing stores a file of its own, even with the same type, and removes the old one after the save', async () => {
    const items = [...ITEMS, picture()];
    render(<Live items={items} saved={{ id: 'c1', items }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select image' }));
    choose('Replace the image', file('other.png', 10, 'image/png'));
    await waitFor(() => expect(media.removePaths).toHaveBeenCalledWith([FOLDER + 'b0050.png'], true));
    expect(vi.mocked(store.saveDraft).mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(media.removePaths).mock.invocationCallOrder[0]);
    expect(vi.mocked(media.uploadMedia).mock.calls[0][2]).not.toBe('b0050.png');
    choose('Replace the image', file('again.png', 10, 'image/png'));
    await waitFor(() => expect(media.uploadMedia).toHaveBeenCalledTimes(2));
    expect(vi.mocked(media.uploadMedia).mock.calls[1][2]).not.toBe(vi.mocked(media.uploadMedia).mock.calls[0][2]);
  });
});

describe('removing what names a file', () => {
  const saved = (items: unknown[]) => ({ id: 'c1', items });
  const sendStep = () => { fireEvent.click(screen.getByRole('button', { name: /^Next:/ })); fireEvent.click(screen.getByRole('button', { name: /^Next:/ })); };
  it('Remove block and leaving without saving removes no file: the saved draft still names it', () => {
    const items = [...ITEMS, picture()];
    const { unmount } = render(<Live items={items} saved={saved(items)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select image' }));
    click('Remove block');
    unmount();
    expect(media.removePaths).not.toHaveBeenCalled();
  });
  it('Remove block then Save draft removes the file after the save, not before', async () => {
    const items = [...ITEMS, picture()];
    render(<Live items={items} saved={saved(items)} studio={{ step: 3 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select image' }));
    click('Remove block');
    expect(media.removePaths).not.toHaveBeenCalled();
    sendStep();
    click('Save draft');
    await waitFor(() => expect(media.removePaths).toHaveBeenCalledWith([FOLDER + 'b0050.png'], true));
    expect(vi.mocked(store.saveDraft).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(media.removePaths).mock.invocationCallOrder[0]);
  });
  it('a duplicate keeps the file while a copy still names it, even after a save', async () => {
    const items = [...ITEMS, picture()];
    render(<Live items={items} saved={saved(items)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select image' }));
    click('Duplicate');
    click('Remove block');
    sendStep();
    click('Save draft');
    await waitFor(() => expect(store.saveDraft).toHaveBeenCalled());
    expect(media.removePaths).not.toHaveBeenCalled();
  });
  it('removing a lesson with an image removes its file after the save', async () => {
    const three = [ITEMS[0], ITEMS[1], ['Lesson 3', 'Third', ''], ...ITEMS.slice(2), picture({ lesson: 2 })];
    render(<Live items={three} saved={saved(three)} />);
    fireEvent.click(screen.getByText(/Third/));
    click('Remove lesson');
    click('Continue');
    expect(media.removePaths).not.toHaveBeenCalled();
    sendStep();
    click('Save draft');
    await waitFor(() => expect(media.removePaths).toHaveBeenCalledWith([FOLDER + 'b0050.png'], true));
  });
  it('editing the alt text removes nothing', () => {
    render(<Live items={[...ITEMS, picture()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select image' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Alt text (read aloud by screen readers)' }), { target: { value: 'Other' } });
    expect(media.removePaths).not.toHaveBeenCalled();
  });
  it('View as shows the image and changes nothing', () => {
    render(<Live readOnly items={[...ITEMS, picture()]} />);
    expect(screen.queryByLabelText('Replace the image')).toBeNull();
    expect(media.removePaths).not.toHaveBeenCalled();
  });
});

describe('a hotspot\'s points', () => {
  const hotspot = () => ({ block: 'hotspot', id: 'b0060', lesson: 0, path: FOLDER + 'b0060.png', alt: 'Invoice', cap: '', spots: [[25, 50, 'One', 'First'], [75, 50, 'Two', 'Second']] }) as CourseBlock;
  it('starts with two points to place and lists what is missing', () => {
    render(<Live />);
    shelf('Interactions', /Hotspot image/);
    expect(screen.getByRole('textbox', { name: 'Point 1 across (%)' })).toHaveProperty('value', '25');
    expect(screen.getByRole('textbox', { name: 'Point 2 down (%)' })).toHaveProperty('value', '50');
    expect(screen.getByText('Lesson 1 · Hotspot image: add the image')).toBeTruthy();
  });
  it('takes a position from 0 to 100 and says why a larger or negative one is not taken', async () => {
    render(<Live items={[...ITEMS, hotspot()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select hotspot image' }));
    const across = screen.getByRole('textbox', { name: 'Point 1 across (%)' });
    fireEvent.change(across, { target: { value: '120' } });
    expect(screen.getByRole('alert').textContent).toBe('Point 1 across (%) is at most 100: a larger number is not taken.');
    fireEvent.change(across, { target: { value: '-5' } });
    expect(screen.getByRole('alert').textContent).toMatch(/cannot be negative/);
    fireEvent.change(across, { target: { value: '40,5' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((await within(screen.getByRole('button', { name: 'Select hotspot image' })).findByText('1', { selector: 'span' })).style.left).toBe('40.5%');
  });
  it('adds a point up to 8 and removes the last down to 2', () => {
    render(<Live items={[...ITEMS, hotspot()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select hotspot image' }));
    expect((screen.getByRole('button', { name: 'Remove the last point' }) as HTMLButtonElement).disabled).toBe(true);
    for (let k = 0; k < 6; k++) click('Add point');
    expect((screen.getByRole('button', { name: 'Add point' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Point 8 title' })).toBeTruthy();
    click('Remove the last point');
    expect(screen.queryByRole('textbox', { name: 'Point 8 title' })).toBeNull();
  });
});
