// A Presentation's panel (studios plan, Task 3.3): the Horizon player over the .horizon file its content names, for the
// learner on the detail page and, read only, for the author and reviewers (studioPreviews.tsx). It reads the
// view-model (fmtHorizon.ts); the player keeps the slide it is on.
import { Card } from '../ds';
import type { HorizonView } from '../fmtHorizon';
import HorizonPlayer from '../horizon/HorizonPlayer';

export default function PresentationPanel({ hz }: { hz: HorizonView }) {
  return (
    <Card title="Play the presentation" subtitle={hz.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {hz.note && <div style={{ fontSize: 12.5, color: '#5a6058' }}>{hz.note}</div>}
        <HorizonPlayer path={hz.path} still={hz.still} onLast={hz.onLast} />
      </div>
    </Card>
  );
}
