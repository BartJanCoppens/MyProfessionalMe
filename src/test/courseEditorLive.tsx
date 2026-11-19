// The course editor on screen, for the tests of the E-learning Studio's Produce step (CourseEditor.test, CourseEmbed.test, CourseImage.test): the example
// course, a Create screen on a Logic over it, and a click helper. The test file mocks '../lib/contributionStore' itself.
import { fireEvent, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import type { CreateData } from '../logic/contribution';
import type { CourseBlock } from '../logic/courseContent';
import { initState, Logic } from '../model';
import type { AppState } from '../types';
import CreateScreen from '../screens/Create';
import { cfg, member, person } from './harness';

export const Q = { t: 'Place', q: 'Where is it taxed?', o: ['Here', 'There', 'Nowhere', 'Both'], a: 1, why: 'Because.' };
export const text = (id: string, lesson: number, h: string): CourseBlock => ({ block: 'text', id, lesson, h, t: 'Words of ' + h });
export const ITEMS = [['Lesson 1', 'Place of supply', 'Where'], ['Lesson 2', 'The invoice', 'What'], text('b0001', 0, 'Intro'), text('b0002', 0, 'Rules'), { block: 'check', id: 'b0003', lesson: 0, question: Q }, text('b0004', 1, 'Fields')];
const rule = { id: 1, user_id: 'u1', lines: ['Consulting'], formats: [], domains: [], audiences: [] };
export const data = (formats: string[] = []): CreateData => ({ contributions: [], reviews: [], rules: [{ ...rule, formats }], policies: [], peers: 3 });
export const nw = { line: 'Consulting', aud: '', type: 'E-learning', title: 'VAT', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'Know where VAT is due.', outline: [], sources: [], ai: false, aiNote: '',
  items: { list: ITEMS as never, how: 'manual' as const, problems: [], note: '' } };

export function Live({ readOnly = false, shape, studio, items, formats }: { formats?: string[]; readOnly?: boolean; shape?: Record<string, string>; studio?: Partial<AppState['studio']>; items?: unknown[] }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'create', create: data(formats), createTab: 'new', nw: { ...nw, shape, items: { ...nw.items, list: (items ?? ITEMS) as never } }, studio: { view: 'studio', step: 3, id: 'elearn', ...studio } }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, member('u1'), person({ readOnly }), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
export const click = (name: string | RegExp, role = 'button') => fireEvent.click(screen.getByRole(role, { name }));
