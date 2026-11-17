// The step bodies a generic studio adds to the spine: Shape it (questions), Draft (item rows) and Produce (choices,
// stock look and voice, build). They only read from the view-model (studioVals.ts, studioStepVals.ts) and use the shared
// ChipGroup and ItemRows. In View as the choices show as plain text and every action is gone.
import { Button, Input } from '../ds';
import type { VM } from '../model';
import ChipGroup from './ChipGroup';
import { ItemRows, Problems } from './CreateShared';
import StudioBuild from './StudioBuild';

type ST = NonNullable<VM['create']>['studio'];
type Group = ST['shape'][number];
const Group = ({ g, st }: { g: Group; st: ST }) => <ChipGroup heading={g.key} chips={g.chips} readOnly={st.readOnly} />;

export function Shape({ st }: { st: ST }) {
  return <>{st.shape.map((g) => <Group key={g.key} g={g} st={st} />)}</>;
}

export function DraftRows({ st }: { st: ST }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
      {!st.readOnly && <div><Button size="sm" variant="dark" onClick={st.aiDraft.run} disabled={st.aiDraft.busy}>{st.aiDraft.label}</Button></div>}
      <Problems list={st.problems} />
      <ItemRows head={'Items · label and text' + (st.hasText2 ? ' · text 2' : '')} note={st.itemsLabel} gap={8}
        rows={st.rows.map((r, k) => (st.readOnly ? { cells: [<b key="l">{r.label}</b>, r.text, ...(st.hasText2 ? [r.text2] : [])] }
          : { cells: [<Input key="l" value={r.label} onChange={(e) => r.edit(0, e.target.value)} aria-label={'Label of item ' + (k + 1)} />,
            <Input key="t" value={r.text} onChange={(e) => r.edit(1, e.target.value)} aria-label={'Text of item ' + (k + 1)} />,
            ...(st.hasText2 ? [<Input key="t2" value={r.text2} onChange={(e) => r.edit(2, e.target.value)} aria-label={'Text 2 of item ' + (k + 1)} />] : [])],
          remove: r.remove, removeTitle: 'Remove item ' + (k + 1) }))} />
      {!st.readOnly && <div><Button size="sm" variant="secondary" onClick={st.add}>Add item</Button></div>}
    </div>
  );
}

export function Produce({ st }: { st: ST }) {
  return (
    <>
      {st.cast.map((g) => <Group key={g.key} g={g} st={st} />)}
      {st.produce.map((g) => <Group key={g.key} g={g} st={st} />)}
      {st.build && <StudioBuild steps={st.build.steps} onChange={st.build.set} runner={st.buildRunner} readOnly={st.readOnly} />}
    </>
  );
}
