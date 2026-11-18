// Where the character is seen and heard (studios plan, Task 6.6): the live video, else the stock portrait with a voice (the AI voice, or the browser's own, labelled),
// else text only. Each rung drops to the next with a message when it fails, ends or is switched off; typing never depends on any of them (S4). The character's line
// is spoken when it arrives (`heard`). The opening line has no stored turn, so the AI portrait voice cannot read it: it is spoken in the browser voice or shown as text.
import { useEffect, useRef, useState } from 'react';
import { Button, LinkButton } from '../ds';
import { useLiveAvatar } from '../avatar/useLiveAvatar';
import type { Heard } from '../avatar/useAvatarRun';
import type { AvatarVals } from '../fmtAvatar';
import { BROWSER_VOICE, sayRunLine, speakInBrowser } from '../lib/voice';
import { stageOf } from '../logic/avatarStage';
import { portraitUrl } from '../reel/portraits';
import { LANGUAGES } from '../../supabase/functions/_shared/avatarRules.ts';

export const VIDEO_UNAVAILABLE = 'Live video is unavailable · the portrait speaks instead';
export const TEXT_ONLY = "Text only · the character's lines appear here";
const small = { fontSize: 12, color: '#5a6058' } as const;
const hasSynthesis = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export default function AvatarStage({ av, runId, heard }: { av: AvatarVals; runId: string; heard: Heard | null }) {
  const [videoOff, setVideoOff] = useState(false), [videoFailed, setVideoFailed] = useState(false), [voiceFailed, setVoiceFailed] = useState(false), [note, setNote] = useState('');
  const { status, attach, speak, stop, resume } = useLiveAvatar({ runId, enabled: av.video && !videoOff, onFallback: (m) => { setVideoFailed(true); setNote(m); } });
  const heardN = heard?.n;
  const failed = videoFailed || status === 'failed' || status === 'ended';
  const browser = hasSynthesis();
  const stage = stageOf({ videoLive: av.video, videoFailed: failed, videoOff, voiceLive: av.voice && !voiceFailed, browserVoice: browser });
  const latest = useRef({ av, stage, speak, browser, runId, heard });
  useEffect(() => { latest.current = { av, stage, speak, browser, runId, heard }; });
  const audio = useRef<HTMLAudioElement | null>(null), spoken = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => { audio.current?.pause(); spoken.current?.stop(); }, []);

  // The character's new line, on the rung the stage is on (the video's refusal of a line drops it to the portrait for that line).
  useEffect(() => {
    const { av: a, stage: s, speak: say, browser: b, runId: id, heard: line } = latest.current;
    if (!line) return;
    const lang = LANGUAGES[a.language].speech;
    audio.current?.pause(); spoken.current?.stop();
    const inBrowser = () => { if (b) spoken.current = speakInBrowser(line.text, { lang }); };
    if (s === 'video' && say(line.text)) return;
    if (s === 'text' || !a.voice || line.opening) { inBrowser(); return; }
    sayRunLine(id).then((url) => { const el = new Audio(url); audio.current = el; el.onended = () => URL.revokeObjectURL(url); return el.play(); })
      .catch(() => { setVoiceFailed(true); setNote('The portrait voice could not speak · the browser voice is used instead'); inBrowser(); });
  }, [heardN]);

  const look = av.look, label = stage === 'video' ? 'Live video · Made with AI' : stage === 'text' ? TEXT_ONLY : av.voice && !voiceFailed ? 'Portrait · AI voice' : BROWSER_VOICE.split(' · ')[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {stage === 'video' ? <video ref={attach} autoPlay playsInline aria-label="The character, live video" style={{ width: 240, maxWidth: '100%', borderRadius: 8, background: '#1a1d18' }} />
          : stage === 'portrait' && look ? <img src={portraitUrl(look.portrait)} alt="" style={{ width: 96, height: 96, borderRadius: '50%', background: look.color, objectFit: 'cover' }} /> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <span style={small}>{label}</span>
          {stage === 'video' && <Button size="sm" variant="secondary" onClick={() => { setVideoOff(true); void stop(); }}>Video off</Button>}
          {av.video && (videoOff || status === 'ended') && <LinkButton onClick={() => { if (videoOff) { setVideoOff(false); setVideoFailed(false); } else { setVideoFailed(false); resume(); } }}>Resume video</LinkButton>}
        </div>
      </div>
      {failed && !videoOff && <div role="status" style={{ ...small, color: '#7a5000' }}>{VIDEO_UNAVAILABLE}{note && note !== VIDEO_UNAVAILABLE && <div>{note}</div>}</div>}
      {!failed && note && <div role="status" style={{ ...small, color: '#7a5000' }}>{note}</div>}
    </div>
  );
}
