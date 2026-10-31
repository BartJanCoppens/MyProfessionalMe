// The Claude Design prototype exposed these as editable props. Here they have defaults
// and can be overridden from the URL, e.g. ?screen=team&view=radar&bl=Audit&motion=off
import type { Screen, View } from './types';

export type Config = {
  businessLine: 'Consulting' | 'Audit' | 'Tax & Legal';
  startScreen: Screen;
  homeView: View;
  showMarks: boolean;
  liveAssistant: boolean;
  motion: boolean;
};

const SCREENS: Screen[] = ['map', 'library', 'team', 'adminLib', 'adminMap', 'users', 'projects', 'profile'];
const VIEWS: View[] = ['constellation', 'radar', 'road'];
const BLS = ['Consulting', 'Audit', 'Tax & Legal'] as const;

export function readConfig(search = window.location.search): Config {
  const q = new URLSearchParams(search);
  const flag = (k: string, d: boolean) => (q.has(k) ? !['0', 'false', 'off', 'no'].includes(String(q.get(k)).toLowerCase()) : d);
  const bl = q.get('bl');
  const screen = q.get('screen') as Screen | null;
  const view = q.get('view') as View | null;
  return {
    businessLine: BLS.find((b) => b === bl) || 'Consulting',
    startScreen: screen && SCREENS.includes(screen) ? screen : 'map',
    homeView: view && VIEWS.includes(view) ? view : 'constellation',
    showMarks: flag('marks', true),
    liveAssistant: flag('live', true),
    motion: flag('motion', true),
  };
}
