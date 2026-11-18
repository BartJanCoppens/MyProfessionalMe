// "Download as video" in the Slides Studio's Preview, for the author only (studios plan, Task 5.4): the deck cut by the browser
// compositor (one renderCut, the Slides draw function) and handed to the author as a file. It is made in the browser and never
// stored or shown to learners, so nothing here uploads. A deck over the 15 minute cap is refused in words.
import type { CSSProperties } from 'react';
import { Button } from '../ds';
import { mediaFileName } from '../logic/mediaFiles';
import { SLIDES_MAX_SECONDS } from '../logic/slidesContent';
import { loadSlideImages } from '../reel/slideImages';
import { slidesCut } from '../reel/slidesCut';
import type { SlidesContent } from '../types';
import CutProgress from './CutProgress';
import { useAudioLinks } from './useAudioLinks';
import { useCutRun } from './useCutRun';

const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };

// Hands the file to the browser's download; the link is released once the browser has taken it.
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function SlidesVideo({ content, title }: { content: SlidesContent; title: string }) {
  const links = useAudioLinks(content.slides.every((s) => s.audio) ? content.slides.map((s) => s.audio!.path) : []), { state, run, cancel } = useCutRun();
  const urls = links && 'urls' in links ? links.urls : null, busy = state.kind === 'running';
  const make = async () => {
    if (!urls) return;
    const { cut } = slidesCut(content, urls, await loadSlideImages(content.slides.map((s) => s.svg)));
    if (cut.seconds > SLIDES_MAX_SECONDS) return;
    const made = await run(cut);
    if (made) download(made.blob, mediaFileName(title || 'slides').replace(/\.+$/, '') + '.' + made.ext);
  };
  const seconds = urls ? slidesCut(content, urls).cut.seconds : 0, over = seconds > SLIDES_MAX_SECONDS;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div><Button size="sm" variant="secondary" disabled={!urls || busy || over} onClick={make}>Download as video</Button></div>
      <div style={muted}>Made in your browser · not stored. It runs as long as the deck ({Math.ceil(seconds / 60)} min) and shows each drawing as a still. A voiced deck carries a "Made with AI · voice" tag.</div>
      {over && <div role="alert" style={{ ...muted, color: '#7a5000' }}>The talk runs over {SLIDES_MAX_SECONDS / 60} minutes · shorten it before making a video</div>}
      {links && 'error' in links && <div role="alert" style={{ ...muted, color: '#7a5000' }}>The voice-over could not be opened · {links.error}</div>}
      <CutProgress state={state} seconds={seconds} onCancel={cancel} onRetry={make} />
    </div>
  );
}
