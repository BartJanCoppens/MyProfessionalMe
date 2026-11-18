// The step bodies a generic studio adds to the spine: Shape it (questions), Draft (item rows) and Produce (choices,
// stock look and voice, build, the Motion Studio's drawing and the Slides Studio's deck). They only read from the view-model (studioVals.ts,
// studioStepVals.ts) and use the shared ChipGroup and ItemRows. In View as the choices show as plain text and every
// action is gone.
import { Button, Input, LinkButton, Textarea } from '../ds';
import type { VM } from '../model';
import ChipGroup from './ChipGroup';
import { ItemRows, Problems } from './CreateShared';
import BrowserVoice from './BrowserVoice';
import StudioBuild from './StudioBuild';

type ST = NonNullable<VM['create']>['studio'];
type Group = ST['shape'][number];
const Group = ({ g, st }: { g: Group; st: ST }) => <ChipGroup heading={g.key} hint={g.hint} chips={g.chips} readOnly={st.readOnly} />;

export function Shape({ st }: { st: ST }) {
  return <>{st.shape.map((g) => <Group key={g.key} g={g} st={st} />)}</>;
}

export function DraftRows({ st }: { st: ST }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
      {!st.readOnly && <div><Button size="sm" variant="dark" onClick={st.aiDraft.run} disabled={st.aiDraft.busy}>{st.aiDraft.label}</Button></div>}
      <Problems list={st.problems} />
      <ItemRows head={'Items · ' + (st.columns ? st.columns.join(' · ') : 'label and text' + (st.hasText2 ? ' · text 2' : ''))} note={st.itemsLabel} gap={8}
        rows={st.rows.map((r, k) => (st.readOnly ? { cells: [<b key="l">{r.label}</b>, r.text, ...(st.hasText2 ? [r.text2] : [])] }
          : { cells: [<Input key="l" value={r.label} onChange={(e) => r.edit(0, e.target.value)} aria-label={(st.columns?.[0] ?? 'Label') + ' of item ' + (k + 1)} />,
            <Input key="t" value={r.text} onChange={(e) => r.edit(1, e.target.value)} aria-label={(st.columns?.[1] ?? 'Text') + ' of item ' + (k + 1)} />,
            ...(st.hasText2 ? [<Input key="t2" value={r.text2} onChange={(e) => r.edit(2, e.target.value)} aria-label={(st.columns?.[2] ?? 'Text 2') + ' of item ' + (k + 1)} />] : [])],
          remove: r.remove, removeTitle: 'Remove item ' + (k + 1) }))} />
      {!st.readOnly && <div><Button size="sm" variant="secondary" onClick={st.add}>Add item</Button></div>}
      {st.check && (
        <>
          <ItemRows head={st.check.head} note={st.itemsLabel} rows={st.check.rows.map((r) => ({ cells: [r.front, r.back] }))} />
          {!st.readOnly && <div><LinkButton tone="muted" onClick={st.check.remove}>Remove the check</LinkButton></div>}
        </>
      )}
    </div>
  );
}

// The Motion Studio's drawing: why it is scripted, who made it, the scripted flow as a choice after a failed AI step, its
// text alternative and building it again.
function MotionOutput({ m, readOnly }: { m: NonNullable<ST['motion']>; readOnly: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {m.note && <div style={{ fontSize: 12.5, color: '#5a6058' }}>{m.note}</div>}
      {m.made && <div style={{ fontSize: 12, fontWeight: 600, color: '#3f6a0a' }}>{m.made}</div>}
      {m.scripted && !readOnly && <div><Button size="sm" variant="secondary" onClick={m.scripted.run}>{m.scripted.label}</Button></div>}
      {m.alt && (readOnly ? <div style={{ fontSize: 13 }}>{m.alt.value}</div> : (
        <>
          <Textarea value={m.alt.value} onChange={(e) => m.alt!.set(e.target.value)} aria-label="Text alternative · learners who cannot watch read this" />
          <Problems list={m.problems} />
        </>
      ))}
      {m.made && !readOnly && <div><LinkButton tone="muted" onClick={m.restart}>Build it again</LinkButton></div>}
    </div>
  );
}

// The Slides Studio's deck: how it is told and how long it runs, and the browser voice to hear a talk-over when the AI voice cannot be
// used (a preview, never stored). In View as there is only the line.
function SlidesOutput({ s, readOnly }: { s: NonNullable<ST['slides']>; readOnly: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5, color: '#5a6058' }}>{s.line}</div>
      {s.hear && !readOnly && <BrowserVoice hear={s.hear} />}
    </div>
  );
}

export function Produce({ st }: { st: ST }) {
  return (
    <>
      {st.cast.map((g) => <Group key={g.key} g={g} st={st} />)}
      {st.produce.map((g) => <Group key={g.key} g={g} st={st} />)}
      {st.build && <StudioBuild steps={st.build.steps} onChange={st.build.set} runner={st.buildRunner} readOnly={st.readOnly} />}
      {st.motion && <MotionOutput m={st.motion} readOnly={st.readOnly} />}
      {st.slides && <SlidesOutput s={st.slides} readOnly={st.readOnly} />}
    </>
  );
}
