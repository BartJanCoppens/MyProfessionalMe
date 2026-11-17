// @vitest-environment jsdom
// "Made with AI" for learners (Phase 2 review, item 3; studios rule, EU AI Act Art. 50): every learning AI made says so on
// its library card and on its page, through one label (AiMadeTag), whatever its format. An Animated flow's panel still
// says how its drawing was made ("Scripted · boxes and arrows" when it was scripted).
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import { parseFormatContent } from '../lib/contentStore';
import { harness } from '../test/harness';
import type { Learn } from '../types';
import { DetailScreen, LibraryScreen } from './Library';

const AID: Learn = ['L991', 'Pricing checklist made with AI', 'prof', 2, 'Job aid', 'Peer contribution', 0.25, 0, '', ''];
const PLAIN: Learn = ['L992', 'Pricing checklist made by hand', 'prof', 2, 'Job aid', 'Peer contribution', 0.25, 0, '', ''];
const FLOW: Learn = ['L993', 'Order-to-cash, stages by AI', 'corp', 1, 'Animated flow', 'Peer contribution', 0.025, 0, '', ''];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="9" height="9"/></svg>';
const STAGES = [{ label: 'Order', text: 'a' }, { label: 'Deliver', text: 'b' }, { label: 'Collect', text: 'c' }];
beforeAll(() => {
  [AID, PLAIN, FLOW].forEach((r) => { LEARN.push(r); LEARN_BY[r[0]] = r; });
  LEARN_META.L991 = { line: null, status: 'published', aiMade: true, content: parseFormatContent({ kind: 'aid', items: ['One', 'Two'] }) };
  LEARN_META.L992 = { line: null, status: 'published', content: parseFormatContent({ kind: 'aid', items: ['One', 'Two'] }) };
  LEARN_META.L993 = { line: null, status: 'published', aiMade: true, content: parseFormatContent({ kind: 'motion', stages: STAGES, svg: SVG, alt: 'Three stages.', seconds: 20, made: 'scripted' }) };
});
afterAll(() => { [AID, PLAIN, FLOW].forEach((r) => { LEARN.splice(LEARN.indexOf(r), 1); delete LEARN_BY[r[0]]; delete LEARN_META[r[0]]; }); });
afterEach(cleanup);

const card = (title: string) => screen.getByText(title).closest('[style*="cursor: pointer"]') as HTMLElement;

describe('Made with AI for learners', () => {
  it('is on the library card of a learning AI made, and only there', () => {
    render(<LibraryScreen vm={harness({ state: { screen: 'library' } }).vm()} />);
    expect(within(card(AID[1])).getByText('Made with AI')).toBeTruthy();
    expect(within(card(PLAIN[1])).queryByText('Made with AI')).toBeNull();
  });
  it('is on the page of a learning AI made, and not on one made by hand', () => {
    render(<DetailScreen vm={harness({ state: { screen: 'detail', detailId: 'L991' } }).vm()} />);
    expect(screen.getAllByText('Made with AI')).toHaveLength(1);
    cleanup();
    render(<DetailScreen vm={harness({ state: { screen: 'detail', detailId: 'L992' } }).vm()} />);
    expect(screen.queryByText('Made with AI')).toBeNull();
  });
  it('is on an Animated flow whose stages AI wrote, while its panel says the drawing is scripted', () => {
    render(<DetailScreen vm={harness({ state: { screen: 'detail', detailId: 'L993' } }).vm()} />);
    expect(screen.getByText('Made with AI')).toBeTruthy();
    expect(screen.getByText(/Scripted · boxes and arrows/)).toBeTruthy();
  });
});
