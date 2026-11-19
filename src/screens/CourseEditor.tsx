// The E-learning Studio's Produce step: the lesson outline, the lesson's blocks, and the selected block's inspector or the shelf (three columns).
// It only reads from the view-model (courseEditVals.ts). In View as the course shows and nothing can be changed.
import { Button, Input, LinkButton } from '../ds';
import type { courseEditVals } from '../courseEditVals';
import CourseBlock from './CourseBlock';
import { BlockInspector, Shelf } from './CourseInspector';
import { Problems } from './CreateShared';
import { label } from './labelStyle';
import { MoveButtons } from './MoveButtons';

type Course = NonNullable<ReturnType<typeof courseEditVals>>;
const column = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 } as const;

function Outline({ c }: { c: Course }) {
  return (
    <div style={{ ...column, flex: '0 1 200px', minWidth: 170 }}>
      <div style={label}>Lessons</div>
      {c.lessons.map((l) => (
        <div key={l.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" aria-current={l.on ? 'true' : undefined} onClick={l.pick} style={{ flex: 1, minWidth: 0, textAlign: 'left', font: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid ' + (l.on ? '#3f6a0a' : '#e1e5dc'), background: l.on ? '#f1f6ea' : '#fff', color: '#1a1d18' }}>
            <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{l.n}. {l.title}</div><div style={{ fontSize: 11.5, color: '#5a6058' }}>{l.meta}</div>
          </button>
          {!c.readOnly && <MoveButtons what={'lesson ' + l.n} noUp={l.noUp} noDown={l.noDown} up={l.up} down={l.down} />}
        </div>
      ))}
      {!c.readOnly && <div><Button size="sm" variant="secondary" onClick={c.addLesson} disabled={c.noAdd}>Add lesson</Button></div>}
    </div>
  );
}

function Canvas({ c }: { c: Course }) {
  return (
    <div style={{ ...column, flex: '1 1 320px' }}>
      {c.readOnly ? <div style={{ fontWeight: 600, fontSize: 15 }}>{c.lessonTitle}</div> : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Input size="lg" aria-label="Lesson title" maxLength={600} value={c.lessonTitle} onChange={(e) => c.setLessonTitle(e.target.value)} style={{ flex: 1 }} />
          <LinkButton tone="muted" onClick={c.removeLesson}>Remove lesson</LinkButton>
        </div>
      )}
      {c.blocks.map((b) => <CourseBlock key={b.id} b={b} mode="edit" />)}
      {!c.blocks.length && <div style={{ fontSize: 12.5, color: '#5a6058' }}>This lesson has no blocks yet.{c.readOnly ? '' : ' Add one from the shelf.'}</div>}
    </div>
  );
}

export default function CourseEditor({ c, readOnly }: { c: Course; readOnly: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12.5, color: '#5a6058' }}>{c.count}</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Outline c={c} />
        <Canvas c={c} />
        {!readOnly && <div style={{ ...column, flex: '0 1 280px', minWidth: 240 }}>{c.inspector && <BlockInspector i={c.inspector} />}<Shelf shelf={c.shelf} /></div>}
      </div>
      <Problems list={c.problems} />
    </div>
  );
}
