// The face of a slide (studios plan, Task 3.3), copied from Horizon's SlideFace.tsx without its editing: the 800 × 450
// slide in its theme's colours, its text and visual placed by its layout (layouts.ts), text that shrinks to fit its box
// (FitBox), a section's card, and its objects (SlideObjects.tsx). Text is React text, never markup. `live` is the slide
// in focus (its visuals play, its avatars speak); `build` draws each body line on its own for the build-in (buildIn.ts).
import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { HeldVisual } from './HeldVisual';
import { fitVisual, geometry, resolveLayout } from './layouts';
import type { TextBox } from './layouts';
import { slideLook, textStyle } from './slideTheme';
import { SlideObjects } from './SlideObjects';
import type { Live } from './SlideObjects';
import type { Frame, Theme } from './types';
import { Visual } from './Visual';
import { vizKey } from './vizCharts';

const MIN_FIT = 0.55, MIN_PX = 11;
const minFor = (...px: number[]) => { const s = Math.min(...px.filter((p) => p > 0)); return isFinite(s) ? Math.min(1, Math.max(MIN_FIT, MIN_PX / s)) : MIN_FIT; };
const fitPx = (px: number) => `calc(${px}px * var(--fit, 1))`;
const tx = (f: Frame, which: 'title' | 'body', base: number): CSSProperties => { const t = textStyle(f, which); return { fontFamily: t.font.css, fontSize: `calc(${base * t.scale}px * var(--fit, 1))` }; };

// Shrinks the text in `outer` until `inner` fits (one --fit variable scales the box); text that does not fit even at
// `min` stays at min and is cut at the bottom of its box.
function fitInto(outer: HTMLElement, inner: HTMLElement, min: number) {
  const set = (k: number) => outer.style.setProperty('--fit', String(+k.toFixed(3)));
  const fits = (k: number) => { set(k); return inner.offsetHeight <= outer.clientHeight + 1 && inner.scrollWidth <= outer.clientWidth + 1; };
  if (fits(1)) return;
  if (!fits(min)) return;
  let lo = min, hi = 1;
  for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  set(lo);
}

function FitBox({ watch, min, style, inner, children, role, build }: { watch: string; min: number; style: CSSProperties; inner?: CSSProperties; children: ReactNode; role?: string; build?: string }) {
  const outer = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const o = outer.current, b = body.current;
    if (!o || !b) return;
    fitInto(o, b, min);
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => fitInto(o, b, min));
    ro.observe(o);
    document.fonts?.ready.then(() => fitInto(o, b, min));
    return () => ro.disconnect();
  }, [watch, min]);
  return <div ref={outer} data-fit-role={role} data-build={build} style={{ overflow: 'hidden', ...style }}><div ref={body} style={{ flex: 'none', ...inner }}>{children}</div></div>;
}

// Title or body text; with `lines`, each line its own span for the build-in.
function Text({ value, field, style, lines }: { value: string; field: string; style: CSSProperties; lines?: boolean }) {
  return <div data-field={field} style={style}>{lines ? value.split('\n').map((l, k, all) => <span key={k} data-line="">{k < all.length - 1 ? l + '\n' : l}</span>) : value}</div>;
}
const watchOf = (f: Frame, ...more: unknown[]) => [f.title, f.body, f.titleFont, f.bodyFont, f.titleScale, f.bodyScale, ...more].join('\u0001');

function LayoutText({ t, n, f, role = 'text', build }: { t: TextBox; n: string; f: Frame; role?: string; build?: boolean }) {
  return (
    <FitBox role={role} watch={watchOf(f, n, t.w, t.h, ...t.sizes)} min={minFor(t.sizes[1] * textStyle(f, 'title').scale, t.sizes[2] * textStyle(f, 'body').scale)}
      style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, display: 'flex', flexDirection: 'column', textAlign: t.align,
        justifyContent: t.valign === 'bottom' ? 'safe flex-end' : t.valign === 'middle' ? 'safe center' : 'flex-start' }}
      inner={{ display: 'flex', flexDirection: 'column', gap: fitPx(12), alignItems: t.align === 'center' ? 'center' : 'stretch' }}>
      {t.sizes[0] > 0 && <div style={{ fontSize: fitPx(t.sizes[0]), letterSpacing: '.1em', color: 'var(--s-kicker)' }}>{n}{f.tag ? <span style={{ textTransform: 'uppercase' }}> · {f.tag}</span> : null}</div>}
      {t.sizes[1] > 0 && <Text value={f.title} field="title" style={{ ...tx(f, 'title', t.sizes[1]), fontWeight: 500, lineHeight: 1.08, letterSpacing: '-0.015em', textWrap: 'balance' }} />}
      {t.sizes[2] > 0 && <Text value={f.body} field="body" lines={build} style={{ ...tx(f, 'body', t.sizes[2]), lineHeight: 1.5, color: 'var(--s-muted)', textWrap: 'pretty', whiteSpace: 'pre-line' }} />}
    </FitBox>
  );
}

function SectionFace({ f, n }: { f: Frame; n: string }) {
  const count = f.section!.frames.length;
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 48, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--s-kicker)' }}>{n} · Section · {count} part{count === 1 ? '' : 's'}</div>
      <FitBox watch={watchOf(f)} min={minFor(46, 17)} style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }} inner={{ display: 'flex', flexDirection: 'column', gap: fitPx(14) }}>
        <Text value={f.title} field="title" style={{ ...tx(f, 'title', 46), fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.02em', textWrap: 'balance' }} />
        <Text value={f.body} field="body" style={{ ...tx(f, 'body', 17), lineHeight: 1.5, color: 'var(--s-muted)', whiteSpace: 'pre-line' }} />
      </FitBox>
    </div>
  );
}

// hold: its visuals stand still at their end (motion off, or Slide animation Low), even in focus.
type Props = { f: Frame; n: string; theme: Theme; media: Record<string, string>; live?: Live; build?: boolean; hold?: boolean };

function PlainFace({ f, n, media, live = null, build, hold }: Props) {
  const g = geometry(f), blank = resolveLayout(f) === 'blank', slot = g.visual && (f.viz || f.image) ? fitVisual(g.visual) : null;
  return (
    <>
      {g.rule && <div style={{ position: 'absolute', left: g.rule.x, top: g.rule.y, width: g.rule.w, height: g.rule.h, background: 'var(--s-acc)' }} />}
      {g.quote ? (
        <>
          <div aria-hidden="true" data-build="quote-mark" style={{ position: 'absolute', left: g.quote.mark.x, top: g.quote.mark.y, fontSize: 150, lineHeight: 1, color: 'var(--s-acc)', fontFamily: 'Georgia, serif' }}>“</div>
          <FitBox role="quote" build="quote" watch={watchOf(f)} min={minFor(g.quote.text.sizes[2])} style={{ position: 'absolute', left: g.quote.text.x, top: g.quote.text.y, width: g.quote.text.w, height: g.quote.text.h, display: 'flex', flexDirection: 'column', justifyContent: 'safe center' }}>
            <Text value={f.body} field="body" style={{ ...tx(f, 'body', g.quote.text.sizes[2]), lineHeight: 1.35, whiteSpace: 'pre-line' }} />
          </FitBox>
          <FitBox role="by" build="by" watch={watchOf(f)} min={minFor(g.quote.by.sizes[1])} style={{ position: 'absolute', left: g.quote.by.x, top: g.quote.by.y, width: g.quote.by.w, height: g.quote.by.h, color: 'var(--s-kicker)', ...tx(f, 'title', g.quote.by.sizes[1]) }} inner={{ display: 'flex', gap: 6 }}>
            <span>—</span><Text value={f.title} field="title" style={{ flex: 1, minWidth: 0 }} />
          </FitBox>
        </>
      ) : !blank && <LayoutText t={g.text} n={n} f={f} build={build} />}
      {g.columns && (
        <FitBox role="columns" watch={watchOf(f)} min={minFor(16)} style={{ position: 'absolute', left: g.columns.x, top: g.columns.y, width: g.columns.w, height: g.columns.h }}>
          <Text value={f.body} field="body" lines={build} style={{ columnCount: 2, columnGap: 40, columnRule: '1px solid var(--s-line2)', ...tx(f, 'body', 16), lineHeight: 1.55, color: 'var(--s-muted)', whiteSpace: 'pre-line' }} />
        </FitBox>
      )}
      {slot && (f.viz
        ? <div data-visual="" style={{ position: 'absolute', left: slot.x, top: slot.y, width: slot.w, height: slot.h, display: 'flex', alignItems: 'center' }}>
            <HeldVisual run={live && !hold ? 'play' : 'still'}><Visual key={vizKey(f.viz) + (live?.run ?? '')} v={f.viz} still={hold} /></HeldVisual>
          </div>
        : <div data-visual="" style={{ position: 'absolute', left: g.visual!.x, top: g.visual!.y, width: g.visual!.w, height: g.visual!.h, display: 'flex', alignItems: 'center', justifyContent: 'center', mixBlendMode: f.imageBlend ? 'lighten' : undefined }}>
            <img src={f.image!} alt={f.imageAlt || ''} draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
          </div>)}
      {g.caption && <LayoutText t={g.caption} n={n} f={f} role="caption" />}
      {!!f.objects?.length && <SlideObjects objects={f.objects} media={media} live={live} hold={hold} />}
    </>
  );
}

export function SlideFace(p: Props) {
  return (
    <div data-slide={p.f.id} role="group" aria-label={'Slide ' + p.n + (p.f.title ? ' · ' + p.f.title : '')}
      style={{ position: 'relative', width: 800, height: 450, overflow: 'hidden', borderRadius: 14, boxShadow: '0 14px 40px rgba(0,0,0,.35)', ...slideLook(p.theme, p.f) }}>
      {p.f.section ? <SectionFace f={p.f} n={p.n} /> : <PlainFace {...p} />}
    </div>
  );
}
