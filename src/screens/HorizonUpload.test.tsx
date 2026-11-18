// @vitest-environment jsdom
// The Presentation's file block on the upload form: the .horizon picker, the added deck and the reasons a file was refused.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HorizonUpload from './HorizonUpload';

afterEach(cleanup);
const panel = (o = {}) => ({ item: null, problems: [], busy: false, max: 'Up to 50 MB', accept: '.horizon', pick: vi.fn(), ...o });

describe('the .horizon file block', () => {
  it('takes a .horizon file and hands it to the view-model', () => {
    const p = panel();
    render(<HorizonUpload p={p} />);
    const input = screen.getByLabelText('.horizon file') as HTMLInputElement;
    expect(input.accept).toBe('.horizon');
    fireEvent.change(input, { target: { files: [new File(['{}'], 'a.horizon')] } });
    expect(p.pick).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Up to 50 MB/)).toBeTruthy();
  });
  it('shows the deck it holds, and why a file was refused', () => {
    render(<HorizonUpload p={panel({ item: { title: 'Garden tour', line: '3 slides' }, problems: ['This file is not JSON, so it is not a Horizon presentation'] })} />);
    expect(screen.getByText('Garden tour')).toBeTruthy();
    expect(screen.getByText(/Replace the file/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('This file is not JSON, so it is not a Horizon presentation');
  });
});
