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

type RunProps = Omit<Props, 'files' | 'test'> & { srcDoc: string };

/** One page in one run: its own host state, so a new page or run starts clean. */
function FrameRun({ srcDoc, height, onFinished, ...ctx }: RunProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [left, setLeft] = useState(false);
  useBridgeHost(frame, { ...ctx, onFinished: (score) => onFinished?.(score), onLeft: () => setLeft(true) });
  if (left) return <div role="alert"><Banner tone="warning">{LEFT_MESSAGE}</Banner></div>;
  return (
    <iframe
      ref={frame}
      title="Game"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={{ width: '100%', height, border: '1px solid var(--tc-line-soft)', borderRadius: 8, background: 'var(--tc-surface)', display: 'block' }}
    />
  );
}

/**
 * A game in the sealed-off frame (ported from GameStudio's GameFrame.tsx): sandbox without same-origin (no
 * storage, no Supabase session), a strict content security policy inside, and the bridge as its only way out.
 * If the frame navigates away from the page it was given, it is replaced by a message.
 */
export function GameFrame({ files, test, height = 'calc(100dvh - 190px)', ...ctx }: Props) {
  const srcDoc = useMemo(() => (files ? buildSrcdoc(files) : null), [files]);
  if (srcDoc === null) return <div style={{ padding: 24, color: 'var(--tc-ink-5)' }}>This game has no code yet.</div>;
  // The key follows the real run id and the page; a test play only stops the score from being saved.
  return <FrameRun key={`${ctx.runId ?? 'preview'}:${srcDoc}`} srcDoc={srcDoc} height={height} {...ctx} runId={test ? null : ctx.runId} />;
}
