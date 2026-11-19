// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import FilePick from './FilePick';

afterEach(cleanup);

describe('FilePick', () => {
  it('ties its hint to the file input', () => {
    render(<FilePick label="Picture" aria="Picture file" accept="image/png" onChange={() => {}} hint="PNG, up to 5 MB" />);
    const input = screen.getByLabelText('Picture file');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('PNG, up to 5 MB').id);
  });
  it('has no description without a hint', () => {
    render(<FilePick label="Picture" aria="Picture file" accept="image/png" onChange={() => {}} />);
    expect(screen.getByLabelText('Picture file').getAttribute('aria-describedby')).toBeNull();
  });
});
