// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Feedback from './Feedback';

afterEach(cleanup);
describe('Feedback', () => {
  it('shows the head in the colour of the rule, then the text', () => {
    render(<Feedback color="#3f6a0a" head="Correct." role="status">Because.</Feedback>);
    const box = screen.getByRole('status');
    expect(box.textContent).toBe('Correct. Because.');
    expect(box.style.borderLeft).toContain('3px solid');
    expect(screen.getByText('Correct.').style.fontWeight).toBe('600');
  });
  it('shows no head when there is none', () => {
    const { container } = render(<Feedback color="#9a2b22">Not quite.</Feedback>);
    expect(container.querySelector('span')).toBeNull();
  });
});
