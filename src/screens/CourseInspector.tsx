// The right column of the course editor: the selected block's fields and actions, or the shelf of blocks to add.
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, LinkButton, Select, Textarea } from '../ds';
import type { courseEditVals } from '../courseEditVals';
import type { FieldView } from '../courseFields';
import { label } from './labelStyle';
import { MoveButtons } from './MoveButtons';

type Course = ReturnType<typeof courseEditVals>;
type Inspector = NonNullable<Course['inspector']>;

// Numbers are typed as text: the field keeps what is typed ("2.", "-") while the block only takes a finished number.
function TextField({ f, common }: { f: FieldView; common: { 'aria-label': string } }) {
  const [raw, setRaw] = useState(f.value);
  // A number below the field's minimum is not taken: the block keeps its last number, and the field says so.
  const below = f.numeric && f.min !== undefined && raw.trim() !== '' && Number(raw) < f.min;
  return (
    <>
      <Input {...common} size="lg" maxLength={f.max} inputMode={f.numeric ? 'decimal' : undefined} invalid={below} value={f.numeric ? raw : f.value} onChange={(e) => { setRaw(e.target.value); f.set(e.target.value); }} />
      {below && <div role="alert" style={{ fontSize: 12, color: '#7a5000' }}>A {f.label.toLowerCase()} cannot be negative: use {f.min} or more.</div>}
    </>
  );
}

function FieldControl({ f }: { f: FieldView }) {
  const common = { 'aria-label': f.label };
  return (
    <Field label={f.label} size="sm">
      {f.kind === 'select' ? <Select {...common} size="md" value={f.value} options={f.options} onChange={(e) => f.set(e.target.value)} />
        : f.kind === 'area' ? <Textarea {...common} minHeight={72} maxLength={f.max} value={f.value} onChange={(e) => f.set(e.target.value)} />
          : <TextField f={f} common={common} />}
    </Field>
  );
}

export function BlockInspector({ i }: { i: Inspector }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <section ref={ref} tabIndex={-1} aria-label={'Edit ' + i.type.toLowerCase()} style={{ display: 'flex', flexDirection: 'column', gap: 10, outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ ...label, flex: 1 }}>{i.type}</span><MoveButtons what="block" noUp={i.noUp} noDown={i.noDown} up={i.up} down={i.down} /></div>
      {i.fields.map((f) => <FieldControl key={f.label} f={f} />)}
      {i.more.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{i.more.map((m) => <Button key={m.label} size="sm" variant="secondary" onClick={m.run} disabled={m.off}>{m.label}</Button>)}</div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid #eef0ea', paddingTop: 8 }}>
        <Button size="sm" onClick={i.done}>Done</Button>
        <LinkButton tone="muted" onClick={i.duplicate}>Duplicate</LinkButton>
        <LinkButton tone="muted" onClick={i.remove}>Remove block</LinkButton>
      </div>
    </section>
  );
}

export function Shelf({ shelf }: { shelf: Course['shelf'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #eef0ea', paddingTop: 10 }}>
      <div style={{ fontSize: 12.5, color: '#5a6058' }}>Add a block after the selected one, or at the end of the lesson.</div>
      {shelf.map((g) => (
        <div key={g.group} role="group" aria-label={g.group} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={label}>{g.group}</div>
          {g.items.map((it) => <Button key={it.label} size="sm" variant="secondary" onClick={it.add} leading={<span aria-hidden>{it.glyph}</span>} style={{ justifyContent: 'flex-start' }}>{it.label}</Button>)}
        </div>
      ))}
    </div>
  );
}
