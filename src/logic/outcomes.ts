// What the learning's detail page lists under its outcomes card: a course lists its own lesson titles (the generic outcomes are about the domain, not the course);
// every other format keeps the domain's outcomes.
import type { FormatContent } from '../types';

export function outcomesOf(content: FormatContent | null | undefined, generic: string[]): { outcomesTitle: string; outcomes: { t: string }[] } {
  if (content?.kind === 'course') return { outcomesTitle: 'What the course covers', outcomes: content.lessons.map((l) => ({ t: l.title })) };
  return { outcomesTitle: 'What you will be able to do', outcomes: generic.map((t) => ({ t })) };
}
