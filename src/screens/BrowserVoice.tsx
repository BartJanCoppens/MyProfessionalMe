// The browser's own voice, to hear a deck's talk-over while the AI voice cannot be used (studios plan, Task 3.4): a preview
// only. It is always labelled "Browser voice · not saved", nothing is stored, and it is never offered as the deck's voice. A
// browser that never starts is said to have been blocked, not pretended to speak (lib/voice.speakInBrowser).
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ds';
import type { BrowserOutcome, BrowserSpeech } from '../lib/voice';

type Hear = { label: string; slides: { title: string; run: () => BrowserSpeech }[] };
const WHY: Partial<Record<BrowserOutcome, string>> = {
  blocked: 'The browser did not start the voice · check its sound settings and try again', failed: 'The browser voice failed', unsupported: 'This browser has no voice to preview with',
};

export default function BrowserVoice({ hear }: { hear: Hear }) {
  const [at, setAt] = useState<number | null>(null), [why, setWhy] = useState(''), speech = useRef<BrowserSpeech | null>(null);
  useEffect(() => () => speech.current?.stop(), []);
  const run = (k: number) => {
    speech.current?.stop();
    setWhy('');
    const s = hear.slides[k].run();
    speech.current = s;
    setAt(k);
    void s.done.then((o) => { if (speech.current === s) { setAt(null); setWhy(WHY[o] ?? ''); } });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
      <div style={{ fontWeight: 500 }}>Hear the talk-over · {hear.label}</div>
      {hear.slides.map((s, k) => (
        <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{k + 1}. {s.title}</span>
          {at === k ? <Button size="sm" variant="secondary" onClick={() => speech.current?.stop()} aria-label={'Stop slide ' + (k + 1)}>Stop</Button>
            : <Button size="sm" variant="secondary" onClick={() => run(k)} aria-label={'Hear slide ' + (k + 1)}>Hear</Button>}
        </div>
      ))}
      {why && <div role="status" style={{ color: '#7a5000' }}>{why}</div>}
    </div>
  );
}
