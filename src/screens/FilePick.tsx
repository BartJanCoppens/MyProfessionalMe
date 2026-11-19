// The one file field of the forms: a label with the words before it, the browser's file input and its accessible name. The caller reads the chosen file
// from the change event (and clears the input when it should accept the same file again). `hint`: a line under the field, tied to the input like a Field's.
import { useId } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { FIELD_HINT_STYLE } from '../ds/fieldHint';

type Props = { label: ReactNode; aria: string; accept: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; disabled?: boolean; hint?: ReactNode };

export default function FilePick({ label, aria, accept, onChange, disabled, hint }: Props) {
  const hintId = useId();
  const field = (
    <label style={{ fontSize: 12.5, color: '#3d423b' }}>
      {label}{' '}
      <input type="file" accept={accept} aria-label={aria} aria-describedby={hint ? hintId : undefined} onChange={onChange} disabled={disabled} style={{ fontSize: 12 }} />
    </label>
  );
  if (!hint) return field;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {field}
      <span id={hintId} style={FIELD_HINT_STYLE}>{hint}</span>
    </div>
  );
}
