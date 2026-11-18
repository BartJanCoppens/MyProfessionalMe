// Create & share: a Presentation's .horizon file (studios plan, Task 3.3). Pick the file made in Horizon; it is checked
// in the browser and refused with the reason before anything is stored, or saved with the draft. It only reads from
// the view-model (createHorizon.ts); the reasons show through the shared Problems list.
import type { VM } from '../model';
import { Problems } from './CreateShared';

type Panel = NonNullable<NonNullable<VM['create']>['horizonPanel']>;

export default function HorizonUpload({ p }: { p: Panel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
      <div style={{ fontWeight: 500 }}>Add the presentation</div>
      <div style={{ fontSize: 12, color: '#5a6058', textWrap: 'pretty' }}>
        Save it in Horizon as a .horizon file ({p.max}). It is played here as in Horizon, without network; animations from Horizon Calc show their last frame.
      </div>
      <label style={{ fontSize: 12.5, color: '#3d423b' }}>
        {p.item ? 'Replace the file ' : 'The .horizon file '}
        <input type="file" accept={p.accept} aria-label=".horizon file" onChange={p.pick} disabled={p.busy} style={{ fontSize: 12 }} />
      </label>
      {p.busy && <div role="status" style={{ fontSize: 12.5, color: '#5a6058' }}>Adding the presentation</div>}
      {p.item && <div style={{ fontSize: 13 }}><b>{p.item.title}</b> · {p.item.line}</div>}
      <Problems list={p.problems} />
    </div>
  );
}
