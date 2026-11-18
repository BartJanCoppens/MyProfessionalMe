// @vitest-environment jsdom
// A slide as the player draws it (studios plan, Task 3.3): layout text, typed charts, pictures, Calc posters and avatar
// stills; and what a hostile file can no longer do (Review Focus 6): no script, no handler, no outside address.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import garden from './fixtures/Garden tour.horizon?raw';
import { crafted } from '../test/horizonDecks';
import { readDeck } from './readDeck';
import { SlideFace } from './SlideFace';
import type { Deck, Frame } from './types';

afterEach(cleanup);
const face = (deck: Deck, f: Frame) => render(<SlideFace f={f} n="01" theme={deck.theme} media={deck.media} />).container;
// Every address in the markup: src, href and xlink:href attributes, and url( in styles.
const addresses = (root: Element) => [...root.querySelectorAll('*')].flatMap((el) => [...el.attributes]
  .filter((a) => /^(src|href|xlink:href|poster)$/i.test(a.name) || /url\(/i.test(a.value)).map((a) => a.value));

describe('a slide', () => {
  it('shows its title, text and typed chart (Garden tour, slide 2)', () => {
    const deck = readDeck(garden), el = face(deck, deck.frames[1]);
    expect(screen.getByText('What grows where')).toBeTruthy();
    expect(screen.getByText('Beds by sunlight, in square metres.')).toBeTruthy();
    const chart = el.querySelector('[data-visual] svg')!;
    expect(chart.getAttribute('viewBox')).toBe('0 0 640 320');
    expect(chart.querySelectorAll('rect')).toHaveLength(2);
    expect(chart.textContent).toContain('Sun');
    expect(chart.querySelectorAll('animate').length).toBeGreaterThan(0);
  });
});

describe('a hostile file (Review Focus 6)', () => {
  const deck = readDeck(JSON.stringify(crafted));
  it('draws a custom SVG only after the sanitiser: no script, no handler, no outside load', () => {
    const el = face(deck, deck.frames[1]), svg = el.querySelector('[data-visual] svg')!;
    expect(svg.textContent).toContain('Safe text');
    expect(el.innerHTML).not.toMatch(/<script|onclick|evil\.example/i);
    expect(svg.querySelector('image')).toBeNull();
  });
  it('shows a Calc animation\'s poster, says it runs in Horizon, and never runs its code', () => {
    const el = face(deck, deck.frames[0]);
    const poster = el.querySelector('[data-kind="animation"] img')!;
    expect(poster.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(poster.getAttribute('alt')).toBe('Bar race');
    expect(el.querySelector('[data-kind="animation"]')!.textContent).toBe('Animation runs in Horizon');
    expect(el.querySelector('iframe, script')).toBeNull();
    expect(el.innerHTML).not.toContain('postMessage');
  });
  it('loads nothing from outside: every address is a data: URL or a reference inside the drawing', () => {
    for (const f of deck.frames) {
      const el = face(deck, f);
      addresses(el).forEach((a) => expect(a).toMatch(/^(data:|#|url\(#)/));
      cleanup();
    }
  });
  it('keeps the picture that is in the file, and an avatar\'s still until it speaks', () => {
    const el = face(deck, deck.frames[0]);
    expect(screen.getByAltText('Inside').getAttribute('src')).toMatch(/^data:image\/png/);
    expect(screen.queryByAltText('Outside')).toBeNull();
    expect(el.querySelector('[data-kind="avatar"] img')!.getAttribute('alt')).toBe('Avatar: Host');
  });
});
