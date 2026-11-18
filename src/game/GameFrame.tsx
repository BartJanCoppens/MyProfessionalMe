import { useMemo, useRef, useState } from 'react';
import { Banner } from '../ds';
import { buildSrcdoc, type GameFiles } from './srcdoc';
import { useBridgeHost, type BridgeContext } from './useBridgeHost';

export const LEFT_MESSAGE = 'This game tried to leave the platform and was stopped.';

type Props = Omit<BridgeContext, 'onLeft' | 'onFinished'> & {
  files: GameFiles | null;
  /** A test play never saves a score, whatever run it carries (a test never counts as progress). */
  test: boolean;
  onFinished?: (score: number | null) => void;
  height?: number | string;
};

/**
 * A game in the sealed-off frame (ported from GameStudio's GameFrame.tsx): sandbox without same-origin (no
 * storage, no Supabase session), a strict content security policy inside, and the bridge as its only way out.
 * If the frame navigates away from the page it was given, it is replaced by a message.
 */
export function GameFrame({ files, test, onFinished, height = 'calc(100dvh - 190px)', ...ctx }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const runId = test ? null : ctx.runId;
  const srcDoc = useMemo(() => (files ? buildSrcdoc(files) : null), [files]);
  // Which page (and run) was stopped for leaving; a new page or run starts clean.
  const frameKey = `${runId ?? 'preview'}:${srcDoc}`;
  const [leftKey, setLeftKey] = useState<string | null>(null);
  const loads = useRef({ key: '', count: 0 });

  useBridgeHost(frame, { ...ctx, runId, onFinished: (score) => onFinished?.(score), onLeft: () => setLeftKey(frameKey) });

  if (leftKey === frameKey) return <div role="alert"><Banner tone="warning">{LEFT_MESSAGE}</Banner></div>;
  if (srcDoc === null) return <div style={{ padding: 24, color: 'var(--tc-ink-5)' }}>This game has no code yet.</div>;
  return (
    <iframe
      ref={frame}
      key={frameKey}
      title="Game"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      // The first load is the game's own page; any further load means it navigated away.
      onLoad={() => {
        if (loads.current.key !== frameKey) loads.current = { key: frameKey, count: 0 };
        loads.current.count += 1;
        if (loads.current.count > 1) setLeftKey(frameKey);
      }}
      style={{ width: '100%', height, border: '1px solid var(--tc-line-soft)', borderRadius: 8, background: '#fff', display: 'block' }}
    />
  );
}
