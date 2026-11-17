import type { CSSProperties } from 'react';
import type { Cover } from '../logic/covers';

const tick: CSSProperties = { width: 18, height: 18, borderRadius: '50%', background: '#86BC25', color: '#10180a', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const play: CSSProperties = { width: 38, height: 38, borderRadius: '50%', background: '#86BC25', color: '#10180a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, paddingLeft: 2, flex: 'none' };
const phone: CSSProperties = { width: 32, height: 56, borderRadius: 5, background: '#2b2f29', border: '1px solid rgba(255,255,255,.14)' };
const blinkDot: CSSProperties = { width: 5, height: 5, borderRadius: '50%', background: '#fff', animation: 'pmBlink 1.2s infinite' };

const Meta = ({ cv, gap = 2, pad = 0 }: { cv: Cover; gap?: number; pad?: number }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, paddingBottom: pad }}><span style={{ fontSize: 12, fontWeight: 600 }}>{cv.cvMeta}</span><span style={{ fontSize: 11, color: cv.cvSub }}>{cv.cvMeta2}</span></div>
);
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 };
const dots = [0, 0.2, 0.4];

// The illustrated top of a library card, one drawing per format (design v3, v4).
export function CoverArt({ cv, title, avInit }: { cv: Cover; title: string; avInit: string }) {
  return (
    <div style={{ position: 'relative', height: 108, flex: 'none', background: cv.cvBg, color: cv.cvFg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid ' + cv.cvLine }}>
      <div style={{ position: 'absolute', left: 12, top: 10, fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', opacity: 0.8 }}>{cv.cvTag}</div>
      {cv.cvDone && <span style={{ ...tick, position: 'absolute', right: 10, top: 9 }}>✓</span>}
      {cv.kind === 'pod' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <span style={play}>▶</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 44 }}>
            {cv.eq.map((b, k) => <span key={k} style={{ width: 4, height: b.h, borderRadius: 2, background: b.c, animation: 'pmEq ' + b.dur + ' ease-in-out infinite', animationDelay: b.d }} />)}
          </div>
        </div>
      )}
      {cv.kind === 'reel' && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
          <div style={{ ...phone, transform: 'rotate(-9deg) translateX(7px)' }} />
          <div style={{ position: 'relative', zIndex: 1, width: 42, height: 74, borderRadius: 6, background: '#2b2f29', border: '1px solid rgba(255,255,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, animation: 'pmBob 3s ease-in-out infinite' }}>
            <div style={{ position: 'absolute', left: 4, right: 4, top: 4, height: 2, background: 'rgba(255,255,255,.18)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', background: '#86BC25', animation: 'pmScan 4s linear infinite' }} /></div>▶
          </div>
          <div style={{ ...phone, transform: 'rotate(9deg) translateX(-7px)' }} />
        </div>
      )}
      {cv.kind === 'avatar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '70%', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7 }}>
            <span style={{ position: 'relative', width: 26, height: 26, borderRadius: '50%', background: '#fff', color: '#1a1d18', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              {avInit}<span style={{ position: 'absolute', left: -3, top: -3, right: -3, bottom: -3, borderRadius: '50%', border: '1.5px solid #86BC25', animation: 'pmPulse 2.4s ease-out infinite' }} />
            </span>
            <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: '10px 10px 10px 2px', padding: '8px 10px', display: 'flex', gap: 4 }}>
              <span style={blinkDot} /><span style={{ ...blinkDot, animationDelay: '.2s' }} /><span style={{ ...blinkDot, animationDelay: '.4s' }} />
            </div>
          </div>
          <div style={{ alignSelf: 'flex-end', background: '#86BC25', borderRadius: '10px 10px 2px 10px', width: '48%', height: 20, animation: 'pmBob 3.2s ease-in-out infinite' }} />
        </div>
      )}
      {cv.kind === 'game' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,18px)', gap: 4, perspective: 200 }}>
            {cv.tiles.map((tl, k) => <span key={k} style={{ width: 18, height: 18, borderRadius: 3, background: tl.bg, animation: 'pmFlip 4.5s ease-in-out infinite', animationDelay: tl.d }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10.5, opacity: 0.7 }}>Level</span>
            <div style={{ display: 'flex', gap: 3 }}>{cv.lvDots.map((ld, k) => <span key={k} style={{ width: 8, height: 8, borderRadius: '50%', background: ld.bg }} />)}</div>
          </div>
        </div>
      )}
      {cv.kind === 'book' && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
          <div style={{ position: 'relative', width: 60, height: 80, perspective: 300 }}>
            <div style={{ position: 'absolute', inset: 0, transform: 'translate(7px,-5px)', background: '#d5dacf', borderRadius: '2px 4px 4px 2px' }} />
            <div style={{ position: 'absolute', inset: 0, background: '#1a1d18', borderRadius: '2px 4px 4px 2px', color: '#fff', padding: '8px 6px 6px 10px', fontSize: 7.5, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: '#86BC25' }} />{title}
            </div>
            <div style={{ position: 'absolute', top: 2, bottom: 2, left: 4, right: 0, background: '#fafbf8', borderRadius: '0 3px 3px 0', transformOrigin: 'left center', animation: 'pmPage 6s ease-in-out infinite', animationDelay: cv.cvDelay, backfaceVisibility: 'hidden', padding: '10px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ height: 2, background: '#d5dacf' }} /><span style={{ height: 2, background: '#d5dacf' }} /><span style={{ height: 2, width: '70%', background: '#d5dacf' }} />
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#5a6058', paddingBottom: 4 }}>{cv.cvMeta}</div>
        </div>
      )}
      {cv.kind === 'class' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <div style={{ width: 64, height: 4, borderRadius: 2, background: '#1a1d18' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10,7px)', gap: 5 }}>
            {cv.seats.map((se, k) => <span key={k} style={{ width: 7, height: 7, borderRadius: '50%', background: se.bg, animation: se.anim }} />)}
          </div>
          <div style={{ fontSize: 11, color: '#5a6058' }}>{cv.cvMeta}</div>
        </div>
      )}
      {cv.kind === 'elearn' && (
        <div style={{ width: '72%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 4 }}>{cv.segs.map((sg, k) => <span key={k} style={{ flex: 1, height: 9, borderRadius: 2, background: sg.bg, animation: sg.anim }} />)}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1d18' }}>{cv.cvMeta}</div>
        </div>
      )}
      {cv.kind === 'mentor' && (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#1a1d18', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>You</span>
          <div style={{ position: 'relative', width: 86, height: 0, borderTop: '2px dashed #b3b8ae' }}><span style={{ position: 'absolute', top: -5, width: 8, height: 8, borderRadius: '50%', background: '#86BC25', animation: 'pmTravel 2.6s ease-in-out infinite alternate' }} /></div>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#86BC25', color: '#10180a', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cv.cvMeta}</span>
        </div>
      )}
      {cv.kind === 'web' && (
        <div style={{ width: '62%', background: '#fff', border: '1px solid #d5dacf', borderRadius: 5, marginTop: 14, overflow: 'hidden' }}>
          <div style={{ height: 9, background: '#eef0ea', borderBottom: '1px solid #e1e5dc' }} />
          <div style={{ padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ height: 5, width: '55%', borderRadius: 2, background: '#1a1d18' }} />
            <span style={{ height: 3, borderRadius: 2, background: '#d5dacf', animation: 'pmBlink 2.4s infinite' }} />
            <span style={{ height: 3, width: '85%', borderRadius: 2, background: '#d5dacf', animation: 'pmBlink 2.4s .3s infinite' }} />
            <span style={{ height: 3, width: '65%', borderRadius: 2, background: '#86BC25', animation: 'pmBlink 2.4s .6s infinite' }} />
          </div>
        </div>
      )}
      {cv.kind === 'flash' && (
        <div style={{ ...row, gap: 16 }}>
          <div style={{ position: 'relative', width: 74, height: 52, perspective: 300 }}>
            <div style={{ position: 'absolute', inset: 0, transform: 'translate(8px,-6px) rotate(4deg)', background: '#d5dacf', borderRadius: 5 }} />
            <div style={{ position: 'absolute', inset: 0, transform: 'translate(4px,-3px) rotate(2deg)', background: '#e9ece5', borderRadius: 5, border: '1px solid #d5dacf' }} />
            <div style={{ position: 'absolute', inset: 0, background: '#fff', border: '1px solid #1a1d18', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#1a1d18', animation: 'pmFlip 5s ease-in-out infinite', animationDelay: cv.cvDelay }}>?</div>
          </div>
          <Meta cv={cv} />
        </div>
      )}
      {cv.kind === 'exam' && (
        <div style={{ ...row, gap: 16 }}>
          <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', border: '3px solid rgba(255,255,255,.18)' }}>
            <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#86BC25', borderRightColor: '#86BC25', animation: 'pmSpin 6s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>{cv.cvMeta}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 84 }}>
            {cv.exBars.map((xb, k) => <span key={k} style={{ display: 'block', height: 4, borderRadius: 2, background: 'rgba(255,255,255,.14)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: xb.w, background: xb.c }} /></span>)}
            <span style={{ fontSize: 11, color: cv.cvSub }}>{cv.cvMeta2}</span>
          </div>
        </div>
      )}
      {cv.kind === 'case' && (
        <div style={{ ...row, alignItems: 'flex-end' }}>
          <div style={{ position: 'relative', width: 70, height: 56 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 30, height: 10, borderRadius: '3px 3px 0 0', background: '#c9a24a' }} />
            <div style={{ position: 'absolute', left: 0, top: 8, right: 0, bottom: 0, borderRadius: '0 4px 4px 4px', background: '#e0b85a', boxShadow: 'inset 0 -14px 0 rgba(0,0,0,.06)' }} />
            <div style={{ position: 'absolute', right: -6, bottom: 6, padding: '1px 5px', border: '1.5px solid #1a1d18', borderRadius: 3, fontSize: 7.5, fontWeight: 700, letterSpacing: '.04em', background: '#fff', transform: 'rotate(-8deg)' }}>DELIVERABLE</div>
          </div>
          <Meta cv={cv} pad={4} />
        </div>
      )}
      {cv.kind === 'teach' && (
        <div style={row}>
          <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 3px', background: '#1a1d18', color: '#fff', display: 'flex', gap: 4, alignItems: 'center' }}>
            {dots.map((d) => <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: '#86BC25', animation: 'pmBlink 1.2s ' + d + 's infinite' }} />)}
          </div>
          <Meta cv={cv} />
        </div>
      )}
      {cv.kind === 'stretch' && (
        <div style={{ ...row, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 52 }}>
            {[['#d5dacf', 16], ['#b9bfb5', 28], ['#1a1d18', 40], ['#86BC25', 52]].map(([bg, h], k) => <span key={k} style={{ width: 14, height: h, borderRadius: 2, background: bg, animation: k === 3 ? 'pmBob 2.4s ease-in-out infinite' : undefined }} />)}
          </div>
          <Meta cv={cv} pad={2} />
        </div>
      )}
      {cv.kind === 'webinar' && (
        <div style={row}>
          <div style={{ width: 70, height: 46, borderRadius: 5, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.06)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ position: 'absolute', left: 5, top: 5, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 5px', borderRadius: 999, background: '#d14537', color: '#fff', fontSize: 7.5, fontWeight: 700 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff', animation: 'pmBlink 1.4s infinite' }} />LIVE</span>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#c9cec5' }} />
          </div>
          <Meta cv={cv} />
        </div>
      )}
      {cv.kind === 'aid' && (
        <div style={row}>
          <div style={{ width: 56, height: 70, borderRadius: 3, background: '#fff', border: '1px solid #d5dacf', padding: '8px 7px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cv.aidRows.map((ar, k) => <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 2, border: '1px solid #1a1d18', background: ar.bg, flex: 'none' }} /><span style={{ height: 2, flex: 1, background: '#d5dacf' }} /></span>)}
          </div>
          <Meta cv={cv} />
        </div>
      )}
      {cv.kind === 'explainer' && (
        <div style={row}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {cv.stepDots.map((d, k) => <span key={k} style={{ display: 'flex', alignItems: 'center' }}>{k > 0 && <span style={{ width: 8, height: 2, background: '#1a1d18' }} />}<span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #1a1d18', background: d.bg }} /></span>)}
          </div>
          <Meta cv={cv} />
        </div>
      )}
      {cv.kind === 'cert' && (
        <div style={{ position: 'relative', width: 58, height: 58, marginTop: 12 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px dashed #86BC25', animation: 'pmSpin 14s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: '#86BC25', color: '#10180a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700 }}>✓</div>
        </div>
      )}
    </div>
  );
}
