// The preview step's registry: one preview per studio kind (StudioDef.pv). Flash plays its cards or questions; a studio
// whose rows publish as a learner format (Job aid, Case) shows that format's own learner panel over studioContent. A
// preview is a play-test: never saved, never counted as progress.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { aidView, casePreview } from '../fmtVals';
import type { VM } from '../model';
import type { AidContent } from '../types';
import { AidPanel, CasePanel } from './FormatWork';
import StudioPlayTest from './StudioPlayTest';

type CS = NonNullable<VM['create']>;
const note = { fontSize: 12.5, color: '#5a6058' };

// The learner's job aid; the ticks live in this preview only.
function AidTry({ content }: { content: AidContent }) {
  const [ticks, setTicks] = useState<number[]>([]);
  return <AidPanel ja={aidView(content, ticks, setTicks, { ro: false, saved: false })} />;
}

// The content as the learner's panel shows it, or what is missing while the rows are not valid.
function Learner({ c }: { c: CS }) {
  const content = c.studio.content;
  if (!content) return <div style={note}>Fix the items in the Draft step first; the preview shows them as learners will.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={note}>A play-test, as learners will see it: nothing is saved or counted.</div>
      {content.kind === 'aid' && <AidTry content={content} />}
      {content.kind === 'case' && <CasePanel ce={casePreview(content)} />}
    </div>
  );
}

const PREVIEWS: Record<string, (p: { c: CS }) => ReactNode> = {
  flash: ({ c }) => <StudioPlayTest preview={c.studio.preview} />,
  aid: ({ c }) => <Learner c={c} />,
  case: ({ c }) => <Learner c={c} />,
};

export function Preview({ kind, c }: { kind: string; c: CS }) {
  const Kind = PREVIEWS[kind];
  return Kind ? <>{Kind({ c })}</> : <div style={note}>Preview comes with this studio</div>;
}
