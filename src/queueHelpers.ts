// What the approvals queue's rows share (recordVals.ts, sharedRunVals.ts): a person's first name and initials, the decisions in flight, and the comment box
// a row writes into (the text per row in `decideNote`, so View as never shows another person's draft).
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import { COMMENT_MAX } from './logic/record';

export type Field = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
// Decisions in flight, per person and learning (or run); a second click while one runs does nothing.
export const BUSY = new Set<string>();
export const first = (name: string) => name.split(/[\s.@]+/)[0] || name;
export const initialsOf = (name: string) => name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export const commentBox = (L: Logic, key: string, max = COMMENT_MAX) => ({
  comment: L.state.decideNote[key] || '',
  setComment: (e: Field) => { const v = e.target.value; L.setState((s) => ({ decideNote: { ...s.decideNote, [key]: v } })); },
  commentCount: (L.state.decideNote[key] || '').trim().length + ' / ' + max,
});
