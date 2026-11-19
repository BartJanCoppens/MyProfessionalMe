// "Download as video" in the Slides Studio's Preview, for the author only (studios plan, Task 5.4): the deck cut by the browser
// compositor (one renderCut, the Slides draw function) and handed to the author as a file. It is made in the browser and never
// stored or shown to learners, so nothing here uploads. A deck over the 15 minute cap is refused in words.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { downloadBlob } from '../fmtShared';
import { Button } from '../ds';
import { mediaUrl } from '../lib/mediaStore';
import { mediaFileName } from '../logic/mediaFiles';
import { SLIDES_MAX_SECONDS } from '../logic/slidesContent';
import { prepareAudio } from '../reel/compositor';
import { loadSlideImages } from '../reel/slideImages';
import { slidesCut } from '../reel/slidesCut';
import type { SlidesContent } from '../types';
import CutProgress from './CutProgress';
import { useMediaLinks } from './useMediaLinks';
import { useCutRun } from './useCutRun';

const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };

export default function SlidesVideo({ content, title }: { content: SlidesContent; title: string }) {
  const voiced = content.slides.every((s) => s.audio), some = content.slides.some((s) => s.audio);
  const paths = useMemo(() => (voiced ? content.slides.map((s) => s.audio!.path) : []), [content, voiced]);
  const links = useMediaLinks(paths), { state, run, cancel } = useCutRun(), urls = links && 'urls' in links ? links.urls : null, busy = state.kind === 'running';
  // The deck's length, from the same cut the video is made from (once per deck, not per render).
  const seconds = useMemo(() => (urls ? slidesCut(content, urls).cut.seconds : 0), [content, urls]), over = seconds > SLIDES_MAX_SECONDS;
  const make = async () => {
    const context = prepareAudio(); // in the click, before any await: Safari starts audio only from a gesture
    const made = await run(async () => {
      // Fresh links: the ones on screen may be an hour old.
      const fresh = await Promise.all(paths.map((p) => mediaUrl(p)));
      return slidesCut(content, fresh, await loadSlideImages(content.slides.map((s) => s.svg))).cut;
    }, context);
    if (made) downloadBlob(mediaFileName(title || 'slides').replace(/\.+$/, '') + '.' + made.ext, made.blob);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div><Button size="sm" variant="secondary" disabled={!urls || busy || over} onClick={make}>Download as video</Button></div>
      <div style={muted}>Made in your browser · not stored. It runs as long as the deck ({Math.ceil(seconds / 60)} min) and shows each drawing as a still. A voiced deck carries a "Made with AI · voice" tag.</div>
      {some && !voiced && <div role="status" style={muted}>Only some slides are voiced, so this video has no sound.</div>}
      {over && <div role="alert" style={{ ...muted, color: '#7a5000' }}>The talk runs over {SLIDES_MAX_SECONDS / 60} minutes · shorten it before making a video</div>}
      {links && 'error' in links && <div role="alert" style={{ ...muted, color: '#7a5000' }}>The voice-over could not be opened · {links.error}</div>}
      <CutProgress state={state} seconds={seconds} onCancel={cancel} onRetry={make} />
    </div>
  );
}
