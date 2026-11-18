// The card around every panel that plays stored voice-over on the step player (a deck's slides, an episode's turns): its title, a
// note, then "loading", why the files could not be opened, or the panel itself once the signed links are there.
import type { CSSProperties, ReactNode } from 'react';
import { Card } from '../ds';
import { useAudioLinks } from './useAudioLinks';

const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
// `loading` and `failed` are the panel's own words.
export function AudioGate({ title, subtitle, note, paths, loading, failed, children }: { title: string; subtitle: string; note?: string; paths: string[]; loading: string; failed: string; children: (urls: string[]) => ReactNode }) {
  const links = useAudioLinks(paths);
  return (
    <Card title={title} subtitle={subtitle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {note && <div style={muted}>{note}</div>}
        {!links ? <div role="status" style={muted}>{loading}</div>
          : 'error' in links ? <div role="alert" style={{ ...muted, color: '#7a5000' }}>{failed} · {links.error}</div>
            : children(links.urls)}
      </div>
    </Card>
  );
}
