// The preview step's registry: one preview per studio kind (StudioDef.pv). Only 'flash' exists in Phase 1; each later
// studio registers its own here. A preview is a play-test: never saved, never counted as progress.
import type { ReactNode } from 'react';
import type { VM } from '../model';
import StudioPlayTest from './StudioPlayTest';

type CS = NonNullable<VM['create']>;
const PREVIEWS: Record<string, (p: { c: CS }) => ReactNode> = {
  flash: ({ c }) => <StudioPlayTest preview={c.studio.preview} />,
};

export function Preview({ kind, c }: { kind: string; c: CS }) {
  const Kind = PREVIEWS[kind];
  return Kind ? <>{Kind({ c })}</> : <div style={{ fontSize: 12.5, color: '#5a6058' }}>Preview comes with this studio</div>;
}
