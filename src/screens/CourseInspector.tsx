// The right column of the course editor: the selected block's fields and actions, or the shelf of blocks to add.
import { Button, Field, Input, LinkButton, Select, Textarea } from '../ds';
import type { courseEditVals } from '../courseEditVals';
import type { FieldView } from '../courseFields';
import { label } from './labelStyle';
import { MoveButtons } from './MoveButtons';

type Course = ReturnType<typeof courseEditVals>;
type Inspector = NonNullable<Course['inspector']>;

function FieldControl({ f }: { f: FieldView }) {
  const common = { 'aria-label': f.label };
  return (
    <Field label={f.label} size="sm">
      {f.kind === 'select' ? <Select {...common} size="md" value={f.value} options={f.options} onChange={(e) => f.set(e.target.value)} />
        : f.kind === 'area' ? <Textarea {...common} minHeight={72} maxLength={f.max} value={f.value} onChange={(e) => f.set(e.target.value)} />
          : <Input {...common} size="lg" maxLength={f.max} type={f.numeric ? 'number' : 'text'} value={f.value} onChange={(e) => f.set(e.target.value)} />}
    </Field>
  );
}

export function BlockInspector({ i }: { i: Inspector }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ ...label, flex: 1 }}>{i.type}</span><MoveButtons what="block" noUp={i.noUp} noDown={i.noDown} up={i.up} down={i.down} /></div>
      {i.fields.map((f) => <FieldControl key={f.label} f={f} />)}
      {i.more.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{i.more.map((m) => <Button key={m.label} size="sm" variant="secondary" onClick={m.run} disabled={m.off}>{m.label}</Button>)}</div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid #eef0ea', paddingTop: 8 }}>
        <Button size="sm" onClick={i.done}>Done</Button>
        <LinkButton tone="muted" onClick={i.duplicate}>Duplicate</LinkButton>
        <LinkButton tone="muted" onClick={i.remove}>Remove block</LinkButton>
      </div>
    </div>
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
