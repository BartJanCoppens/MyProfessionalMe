// The example course of the course editor's tests (CourseEditor.test, CourseEmbed.test, CourseImageEdit.test): its items, a draft over them, the creation rules
// and a click helper. courseEditorLive.tsx puts them on screen.
import { fireEvent, screen } from '@testing-library/react';
import type { CreateData } from '../logic/contribution';
import type { CourseBlock } from '../logic/courseContent';

export const Q = { t: 'Place', q: 'Where is it taxed?', o: ['Here', 'There', 'Nowhere', 'Both'], a: 1, why: 'Because.' };
export const text = (id: string, lesson: number, h: string): CourseBlock => ({ block: 'text', id, lesson, h, t: 'Words of ' + h });
export const ITEMS = [['Lesson 1', 'Place of supply', 'Where'], ['Lesson 2', 'The invoice', 'What'], text('b0001', 0, 'Intro'), text('b0002', 0, 'Rules'), { block: 'check', id: 'b0003', lesson: 0, question: Q }, text('b0004', 1, 'Fields')];
const rule = { id: 1, user_id: 'u1', lines: ['Consulting'], formats: [], domains: [], audiences: [] };
export const data = (formats: string[] = [], contributions: CreateData['contributions'] = []): CreateData => ({ contributions, reviews: [], rules: [{ ...rule, formats }], policies: [], peers: 3 });
export const nw = { line: 'Consulting', aud: '', type: 'E-learning', title: 'VAT', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'Know where VAT is due.', outline: [], sources: [], ai: false, aiNote: '',
  items: { list: ITEMS as never, how: 'manual' as const, problems: [], note: '' } };
export const click = (name: string | RegExp, role = 'button') => fireEvent.click(screen.getByRole(role, { name }));
