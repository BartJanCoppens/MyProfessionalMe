// The course panel (E-learning Studio, Task 1.4): the one panel for a learner on the detail page, the Studio's preview and a reviewer's view. The lesson on
// show with its position and progress, its blocks as the learner works them (CourseBlock in play mode), Previous and Next, the score line and how the course
// completes. An embedded learning plays through `renderEmbed` (the format's own learner panel: the detail page's, or the Studio's play-test). It only reads the view-model (fmtCourse.ts). The preview's Desktop / Phone toggle and Start over are the preview's own (studioPreviews.tsx).
import type { ReactNode } from 'react';
import { Button, Card } from '../ds';
import type { CourseView } from '../fmtCourse';
import AiMadeTag from './AiMadeTag';
import CourseBlock, { EmbedCard } from './CourseBlock';

const muted = { fontSize: 12.5, color: '#5a6058' } as const;

export default function CoursePanel({ co, renderEmbed }: { co: CourseView; renderEmbed: (learningId: string) => ReactNode }) {
  return (
    <Card title="Take the course" subtitle={co.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AiMadeTag on={co.ai} />
        {co.note && <div style={muted}>{co.note}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#5a6058' }}><span>{co.pos}</span></div>
          <div role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parseInt(co.progW, 10)} style={{ height: 6, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: co.progW, background: '#86BC25' }} />
          </div>
          <h3 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>{co.title}</h3>
        </div>
        {co.blocks.map((b) => b.kind === 'embed' ? <EmbedCard key={b.id} e={b} panel={renderEmbed(b.learning)} /> : <CourseBlock key={b.id} b={b} mode="play" />)}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={co.prev} disabled={co.noPrev}>‹ Previous lesson</Button>
          <Button size="sm" onClick={co.next} disabled={co.noNext}>Next lesson ›</Button>
        </div>
        {co.scoreLine && <div role="status" style={{ fontSize: 13, fontWeight: 600 }}>{co.scoreLine}</div>}
        <div style={muted}>{co.ruleLine}</div>
      </div>
    </Card>
  );
}
