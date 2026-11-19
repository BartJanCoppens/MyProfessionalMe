// The course editor on screen, for the tests of the E-learning Studio's Produce step: a Create screen on a Logic over the example course
// (courseEditorFixtures.ts). The test file mocks '../lib/contributionStore' itself.
import { useRef, useState } from 'react';
import { initState, Logic } from '../model';
import type { AppState } from '../types';
import CreateScreen from '../screens/Create';
import { cfg, member, person } from './harness';
import { ITEMS, data, nw } from './courseEditorFixtures';

export function Live({ readOnly = false, shape, studio, items, formats }: { formats?: string[]; readOnly?: boolean; shape?: Record<string, string>; studio?: Partial<AppState['studio']>; items?: unknown[] }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'create', create: data(formats), createTab: 'new', nw: { ...nw, shape, items: { ...nw.items, list: (items ?? ITEMS) as never } }, studio: { view: 'studio', step: 3, id: 'elearn', ...studio } }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, member('u1'), person({ readOnly }), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
