// The one reel panel (studios plan, Task 5.3), for the learner on the detail page, as the Reel Studio's preview and, read only, for
// the author and reviewers (studioPreviews.tsx). A reel with a rendered video plays in the browser's own video element, its
// captions a switchable text track (on by default when they are not burned in); a reel without one (every v3 reel, a text-only
// studio reel) plays scene by scene on the shared step player with the canvas as its picture. Below: the one takeaway, the
// transcript and the check that completes the reel. It reads the view-model (fmtReel.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Hover } from '../ds';
import type { ReelView } from '../fmtReel';
import { toVtt } from '../logic/captions';
import { AudioGate } from './AudioGate';
import ReelCanvas from './ReelCanvas';
import StepPlayer from './StepPlayer';

const caps: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' };
const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };

export default function ReelPanel({ rl }: { rl: ReelView }) {
  return (
    <AudioGate title="Watch" subtitle={rl.sub} note={rl.note} paths={rl.paths} loading="Loading the reel" failed="The reel could not be opened">
      {(urls) => (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '0 1 300px', minWidth: 0 }}>{rl.rc.video ? <Video rl={rl} url={urls[0]} /> : <Scenes rl={rl} />}</div>
          <Below rl={rl} />
        </div>
      )}
    </AudioGate>
  );
}

function Scenes({ rl }: { rl: ReelView }) {
  const steps = useMemo(() => rl.rc.scenes.map((s, k) => ({ part: String(k), seconds: s.seconds, marks: [] })), [rl.rc.scenes]);
  return <StepPlayer steps={steps} onEnd={rl.onEnd}>{(at) => <ReelCanvas plan={rl.plan} t={(rl.rc.scenes[at.index]?.start ?? 0) + at.t} />}</StepPlayer>;
}

function Video({ rl, url }: { rl: ReelView; url: string }) {
  const [failed, setFailed] = useState(false), track = useRef<HTMLTrackElement>(null), video = rl.rc.video!;
  const vtt = rl.cues ? toVtt(rl.cues) : null;
  // The text track reads a Blob URL of the cues; it is revoked when the cues change or the video goes.
  useEffect(() => {
    if (!vtt || !track.current) return;
    const u = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    track.current.src = u;
    return () => URL.revokeObjectURL(u);
  }, [vtt]);
  if (failed) return <div role="alert" style={{ ...muted, color: '#7a5000' }}>This browser cannot play this video ({video.mime === 'video/webm' ? 'WebM' : 'MP4'}) · the transcript has every word</div>;
  return (
    <video controls playsInline src={url} onError={() => setFailed(true)} onEnded={rl.onEnd} style={{ width: rl.rc.size === '1080x1080' ? 260 : 210, maxWidth: '100%', borderRadius: 6, background: '#171a16', display: 'block' }}>
      {vtt && <track ref={track} kind="captions" srcLang="en" label="Captions" default={!rl.rc.burned} />}
    </video>
  );
}

function Below({ rl }: { rl: ReelView }) {
  return (
    <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rl.takeaway && <div><div style={caps}>The one takeaway</div><p style={{ margin: '4px 0 0', textWrap: 'pretty' }}>{rl.takeaway}</p></div>}
      <details>
        <summary style={caps}>Transcript</summary>
        <ol data-testid="transcript" style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rl.rc.scenes.map((s, k) => (
            <li key={k} style={{ textWrap: 'pretty' }}>
              <span style={{ fontWeight: 600 }}>{s.label}</span>: {s.text}
              {s.onScreen !== s.text && <div style={muted}>On screen: {s.onScreen}</div>}
            </li>
          ))}
        </ol>
      </details>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={caps}>Check yourself · completes the reel</div>
        <div style={{ fontWeight: 600, textWrap: 'pretty' }}>{rl.q}</div>
        {rl.opts.map((o) => (
          <Hover key={o.label} as="button" type="button" onClick={o.pick} hoverStyle={{ borderColor: '#1a1d18' }}
            style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 6, border: '1px solid ' + o.bd, background: o.bg, color: '#1a1d18', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>{o.label}</Hover>
        ))}
        {rl.hasFb && <div role="status" style={{ fontSize: 12.5, color: rl.fbColor, fontWeight: 500 }}>{rl.fb}</div>}
      </div>
    </div>
  );
}
