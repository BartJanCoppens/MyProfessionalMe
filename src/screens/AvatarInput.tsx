// How the learner answers the character (studios plan, Task 6.6): hold to talk (the browser's speech input, push-to-talk only, nothing recorded) or type. "Switch to
// typing" is always there while speech input is on, so a blocked microphone or a failing recogniser never leaves the learner stuck (S4). Typing is the default where
// the browser has no speech input (Firefox).
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button, LinkButton, Textarea } from '../ds';
import { useSpeechInput } from '../avatar/useSpeechInput';
import { AVATAR_ASK } from '../../supabase/functions/_shared/avatarRules.ts';

export const SPEECH_NOTE = 'Your browser turns your speech into text. In Chrome and Edge the audio goes to Google or Microsoft to do that. Nothing is recorded here.';
export const NO_SPEECH = 'This browser has no speech input · type your lines';
const small = { fontSize: 12, color: '#5a6058' } as const;
const isHoldKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter';

// onSend resolves true when the line went through (the typed text is then cleared).
export default function AvatarInput({ lang, disabled, onSend }: { lang: string; disabled: boolean; onSend: (text: string) => Promise<boolean> }) {
  const [typing, setTyping] = useState(false), [text, setText] = useState(''), [blocked, setBlocked] = useState('');
  const speech = useSpeechInput({ lang, onFinal: (said) => { void onSend(said); }, onError: () => { setBlocked('The microphone is blocked or missing · type your lines'); setTyping(true); } });
  const typed = !speech.supported || typing;
  const send = async () => { if (text.trim() && await onSend(text.trim())) setText(''); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {typed ? (
        <>
          <Textarea value={text} maxLength={AVATAR_ASK.sayChars} aria-label="Your line" placeholder="Your line to the character" onChange={(e) => setText(e.target.value)} disabled={disabled} minHeight={56} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button onClick={send} disabled={disabled || !text.trim()}>Send</Button>
            {speech.supported && <LinkButton onClick={() => { setBlocked(''); setTyping(false); }}>Use your voice</LinkButton>}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button disabled={disabled} onPointerDown={speech.hold} onPointerUp={speech.release} onPointerLeave={speech.release} onPointerCancel={speech.cancel}
            onKeyDown={(e: KeyboardEvent) => { if (isHoldKey(e) && !e.repeat) { e.preventDefault(); speech.hold(); } }} onKeyUp={(e: KeyboardEvent) => { if (isHoldKey(e)) speech.release(); }}>
            {speech.listening ? 'Listening · release to send' : 'Hold to talk'}
          </Button>
          <LinkButton onClick={() => { speech.cancel(); setTyping(true); }}>Switch to typing</LinkButton>
        </div>
      )}
      {speech.listening && speech.interim && <div style={small}>Hearing: {speech.interim}</div>}
      <div style={small}>{speech.supported ? SPEECH_NOTE : NO_SPEECH}</div>
      {blocked && <div role="alert" style={{ ...small, color: '#a33' }}>{blocked}</div>}
    </div>
  );
}
