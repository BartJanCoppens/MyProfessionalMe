// A slide's visual (studios plan, Task 3.3), from Horizon's viz.tsx `viz()`: a typed chart (vizCharts.ts, vizMaps.ts)
// or, `custom`, an original animated SVG, drawn only through the app's one SVG path (SafeSvg: sanitiseSvg + instance),
// which replaces Horizon's own copy of the sanitiser. Only the rows a kind has room for are drawn, as in Horizon.
import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import SafeSvg from '../screens/SafeSvg';
import type { PresetType, Viz } from './types';
import { bars, flow, trend } from './vizCharts';
import type { Draw } from './vizCharts';
import { circles, counter, network, orbit, pyramid, timeline, tree } from './vizMaps';

const VIZ: Record<PresetType, Draw> = { bars, trend, flow, orbit, timeline, counter, network, pyramid, tree, circles };

export function Visual({ v, still }: { v: Viz; still?: boolean }): ReactNode {
  if (v.type === 'custom') return v.svg ? <SafeSvg svg={v.svg} label="Animation" /> : null;
  const items = (v.items || []).slice(0, v.type === 'counter' ? 1 : 6);
  return h('svg', { viewBox: '0 0 640 320', width: '100%', style: { display: 'block', overflow: 'visible' }, role: 'img', 'aria-label': 'Chart' }, ...VIZ[v.type](items, v, { still }));
}
