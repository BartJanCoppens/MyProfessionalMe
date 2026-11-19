// The one file field of the forms: a label with the words before it, the browser's file input and its accessible name. The caller reads the chosen file
// from the change event (and clears the input when it should accept the same file again).
import type { ChangeEvent, ReactNode } from 'react';

export default function FilePick({ label, aria, accept, onChange, disabled }: { label: ReactNode; aria: string; accept: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; disabled?: boolean }) {
  return (
    <label style={{ fontSize: 12.5, color: '#3d423b' }}>
      {label}{' '}
      <input type="file" accept={accept} aria-label={aria} onChange={onChange} disabled={disabled} style={{ fontSize: 12 }} />
    </label>
  );
}
