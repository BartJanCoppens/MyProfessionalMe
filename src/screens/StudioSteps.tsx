// The step bodies a generic studio adds to the spine: Shape it (questions), Draft (item rows) and Produce (choices,
// stock look and voice, build). They only read from the view-model (studioVals.ts, studioStepVals.ts). In View as the
// choices show as plain text and every action is gone.
import { Button, FilterChip, Input, LinkButton, Tag } from '../ds';
import type { VM } from '../model';
import StudioBuild from './StudioBuild';

type ST = NonNullable<VM['create']>['studio'];
type Group = ST['shape'][number];
const label = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase' as const, letterSpacing: '.04em' };
const col = { display: 'flex', flexDirection: 'column' as const, gap: 8 };

// The one chip-choice group: Shape, Produce, cast pickers and the Idea step's format all use it (DS FilterChip).
export function Chips({ group, readOnly, title = group.key }: { group: Group; readOnly: boolean; title?: string }) {
  const picked = group.options.find((o) => o.on);
  return (
    <div style={col}>
      <span style={{ fontWeight: 500 }}>{title}</span>
      {readOnly ? <div style={{ fontSize: 12.5, color: '#3d423b' }}>{picked ? picked.label : 'Not chosen'}</div> : (
        <div role="group" aria-label={group.key} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {group.options.map((o) => <FilterChip key={o.label} selected={o.on} onClick={o.pick}>{o.label}</FilterChip>)}
        </div>
      )}
    </div>
  );
}

export function Shape({ st }: { st: ST }) {
  return <>{st.shape.map((g) => <Chips key={g.key} group={g} readOnly={st.readOnly} />)}</>;
}

export function DraftRows({ st }: { st: ST }) {
  const cols = st.hasText2 ? 'minmax(0,1fr) minmax(0,2fr) minmax(0,2fr) auto' : 'minmax(0,1fr) minmax(0,3fr) auto';
  return (
    <div style={{ ...col, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={label}>Items · label and text{st.hasText2 ? ' · text 2' : ''}</span>
        {st.itemsLabel && <Tag tone="blue">{st.itemsLabel}</Tag>}
      </div>
      {/* Task 1.4: the "Draft with AI" action for this studio (st.aiDraft) goes here; today only Flash has a draft, in its item panel. */}
      {st.problems.map((p) => <div key={p} role="alert" style={{ fontSize: 12, color: '#7a5000' }}>{p}</div>)}
      {st.rows.map((r, k) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'start' }}>
          {st.readOnly ? <><span style={{ fontWeight: 500 }}>{r.label}</span><span>{r.text}</span>{st.hasText2 && <span>{r.text2}</span>}</> : (
            <>
              <Input value={r.label} onChange={(e) => r.edit(0, e.target.value)} aria-label={'Label of item ' + (k + 1)} />
              <Input value={r.text} onChange={(e) => r.edit(1, e.target.value)} aria-label={'Text of item ' + (k + 1)} />
              {st.hasText2 && <Input value={r.text2} onChange={(e) => r.edit(2, e.target.value)} aria-label={'Text 2 of item ' + (k + 1)} />}
              <LinkButton tone="muted" onClick={r.remove} title={'Remove item ' + (k + 1)}>Remove</LinkButton>
            </>
          )}
        </div>
      ))}
      {!st.readOnly && <div><Button size="sm" variant="secondary" onClick={st.add}>Add item</Button></div>}
    </div>
  );
}

export function Produce({ st }: { st: ST }) {
  return (
    <>
      {st.cast.map((g) => <Chips key={g.key} group={g} readOnly={st.readOnly} />)}
      {st.produce.map((g) => <Chips key={g.key} group={g} readOnly={st.readOnly} />)}
      {st.build && <StudioBuild key={st.def.id} names={st.build} runner={st.buildRunner} readOnly={st.readOnly} />}
    </>
  );
}
