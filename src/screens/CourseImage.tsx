// A course's picture (E-learning Studio, Task 2.3), for the editor and the player alike: the stored file through a signed link (useAudioLinks, the same link
// reader the voice-overs use), its alt text, its caption and, for a hotspot, numbered points placed in percent of the picture. In the player each point is a
// button that opens its title and text, and "All points as text" lists every point for those who do not use the picture. In the editor the points only show
// where they sit, and a picture with no file says "Add an image" (never a placeholder), and one with no alt text says so.
import type { CSSProperties } from 'react';
import type { BlockMode } from '../fmtCourse';
import { useAudioLinks } from './useAudioLinks';

export type Spot = { n: number; x: number; y: number; title: string; text: string; on: boolean; pick: () => void };
const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
const dot = (on: boolean): CSSProperties => ({ position: 'absolute', transform: 'translate(-50%, -50%)', width: 24, height: 24, padding: 0, borderRadius: '50%', border: '2px solid #fff', font: 'inherit', fontSize: 11,
  fontWeight: 700, lineHeight: '20px', textAlign: 'center', background: on ? '#86BC25' : '#1a1d18', color: on ? '#1a1d18' : '#fff', boxShadow: '0 0 0 2px rgba(134,188,37,.5)' });

function Picture({ path, alt, spots, play }: { path: string; alt: string; spots: Spot[]; play: boolean }) {
  const links = useAudioLinks(path ? [path] : []);
  if (!path) return <div style={muted}>{play ? 'This image has no file' : 'Add an image'}</div>;
  if (!links) return <div style={muted}>Loading the image…</div>;
  if ('error' in links) return <div role="alert" style={muted}>The image could not be opened · {links.error}</div>;
  return (
    <div style={{ position: 'relative', lineHeight: 0 }}>
      <img src={links.urls[0]} alt={alt} style={{ width: '100%', display: 'block', borderRadius: 6 }} />
      {spots.map((s) => {
        const at = { ...dot(s.on), left: s.x + '%', top: s.y + '%' };
        return play ? <button key={s.n} type="button" aria-label={'Point ' + s.n + ': ' + s.title} aria-pressed={s.on} onClick={s.pick} style={{ ...at, cursor: 'pointer' }}>{s.n}</button>
          : <span key={s.n} aria-hidden="true" style={at}>{s.n}</span>;
      })}
    </div>
  );
}

export default function CourseImage({ path, alt, cap, spots = [], mode }: { path: string; alt: string; cap: string; spots?: Spot[]; mode: BlockMode }) {
  const play = mode === 'play', open = spots.find((s) => s.on);
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Picture path={path} alt={alt} spots={spots} play={play} />
      {cap.trim() && <figcaption style={{ ...muted, fontSize: 12 }}>{cap}</figcaption>}
      {!play && !alt.trim() && <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: '#fdf3dc', color: '#7a5000' }}>No alt text yet</span>}
      {play && spots.length > 0 && (
        <>
          <div role="status" style={{ borderLeft: '3px solid #1a1d18', padding: '4px 10px', fontSize: 13 }}>
            {open ? <><div style={{ fontWeight: 600 }}>{open.title}</div><div style={{ whiteSpace: 'pre-wrap' }}>{open.text}</div></> : <span style={muted}>Select a point to read about it.</span>}
          </div>
          <details><summary style={{ cursor: 'pointer', ...muted }}>All points as text</summary>
            <ol style={{ margin: '4px 0 0', paddingLeft: 22, fontSize: 13 }}>{spots.map((s) => <li key={s.n}><span style={{ fontWeight: 600 }}>{s.title}</span> · {s.text}</li>)}</ol>
          </details>
        </>
      )}
    </figure>
  );
}
