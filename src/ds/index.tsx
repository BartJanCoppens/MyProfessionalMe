// Port of the TaxConnect design-system components used by MyProfessionalMe.
// Inline-style React on the CSS tokens in src/styles/tokens; keep values in sync with the DS bundle.
import { Fragment, useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export type Opt = { value: string; label: string };
export type Status = 'not-started' | 'in-progress' | 'submitted' | 'clarification' | 'accepted' | 'na';

// ---------- actions ----------

const BTN_VARIANTS = {
  primary: { bg: 'var(--tc-green)', hover: 'var(--tc-green-hover)', fg: 'var(--tc-green-ink)', border: '0', weight: 600 },
  dark: { bg: 'var(--tc-ink)', hover: 'var(--tc-ink-hover)', fg: '#fff', border: '0', weight: 600 },
  secondary: { bg: '#fff', hover: 'var(--tc-surface-sunken)', fg: 'var(--tc-ink)', border: '1px solid var(--tc-line)', weight: 500 },
  accent: { bg: 'var(--tc-green-100)', hover: 'var(--tc-green-200)', fg: 'var(--tc-ink)', border: '1px solid var(--tc-green)', weight: 600 },
  onDark: { bg: 'transparent', hover: 'var(--tc-shell-fill-2)', fg: '#fff', border: '1px solid var(--tc-shell-line-4)', weight: 500 },
};
const BTN_HEIGHTS = { sm: 30, md: 32, lg: 34, xl: 36, '2xl': 40, '3xl': 42 };

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & {
  variant?: keyof typeof BTN_VARIANTS; size?: keyof typeof BTN_HEIGHTS; fullWidth?: boolean; leading?: ReactNode; style?: CSSProperties;
};
export function Button({ variant = 'primary', size = 'md', disabled = false, fullWidth = false, leading, children, style, type = 'button', ...rest }: ButtonProps) {
  const [hover, setHover] = useState(false);
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  const h = BTN_HEIGHTS[size] || 32;
  const padX = h >= 40 ? 18 : h >= 34 ? 14 : 12;
  const fs = h >= 40 ? 14 : h <= 30 ? 12.5 : 13;
  return (
    <button {...rest} type={type} disabled={disabled} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: h, padding: '0 ' + padX + 'px', border: v.border, borderRadius: 6,
        background: hover && !disabled ? v.hover : v.bg, color: v.fg, fontFamily: 'inherit', fontSize: fs, fontWeight: v.weight, lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', width: fullWidth ? '100%' : undefined, ...style }}>
      {leading}{children}
    </button>
  );
}

export function FilterChip({ selected = false, tone = 'default', children, onClick, style }: { selected?: boolean; tone?: 'default' | 'amber' | 'static'; children?: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  const amber = tone === 'amber', isStatic = tone === 'static';
  const bg = selected ? 'var(--tc-ink)' : amber ? 'var(--tc-amber-bg-soft)' : isStatic ? 'var(--tc-surface-muted)' : '#fff';
  const fg = selected ? '#fff' : amber ? 'var(--tc-amber-text)' : isStatic ? 'var(--tc-ink)' : 'var(--tc-ink-3)';
  const bd = selected ? 'var(--tc-ink)' : amber ? 'var(--tc-amber-line)' : isStatic ? 'transparent' : 'var(--tc-line)';
  return (
    <button type="button" onClick={isStatic ? undefined : onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 12px', border: '1px solid ' + bd, borderRadius: 999, background: bg, color: fg,
        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: isStatic ? 'default' : 'pointer', whiteSpace: 'nowrap', ...style }}>
      {children}
    </button>
  );
}

const LINK_TONES = {
  link: { fg: 'var(--tc-green-deep)', hoverFg: 'var(--tc-green-deep)', underline: false },
  onTint: { fg: 'var(--tc-green-text)', hoverFg: 'var(--tc-green-text)', underline: true },
  muted: { fg: 'var(--tc-ink-4)', hoverFg: 'var(--tc-ink)', underline: false },
  onDark: { fg: 'var(--tc-shell-muted)', hoverFg: '#fff', underline: false },
};
export function LinkButton({ tone = 'link', strong = false, size = 13, children, onClick, title, style }: { tone?: keyof typeof LINK_TONES; strong?: boolean; size?: number; children?: ReactNode; onClick?: () => void; title?: string; style?: CSSProperties }) {
  const [hover, setHover] = useState(false);
  const t = LINK_TONES[tone] || LINK_TONES.link;
  return (
    <button type="button" onClick={onClick} title={title} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: 'none', border: 0, padding: 0, color: hover ? t.hoverFg : t.fg, fontFamily: 'inherit', fontSize: size, fontWeight: strong ? 600 : 500,
        cursor: 'pointer', textAlign: 'left', textDecoration: hover || t.underline ? 'underline' : 'none', whiteSpace: 'nowrap', ...style }}>
      {children}
    </button>
  );
}

export function PillToggle({ options = [], value, onChange, onDark = false, size = 'sm', stretch = false, style }: { options?: Opt[]; value?: string; onChange?: (v: string) => void; onDark?: boolean; size?: 'xs' | 'sm'; stretch?: boolean; style?: CSSProperties }) {
  const h = size === 'xs' ? 24 : 26;
  return (
    <div style={{ display: stretch ? 'flex' : 'inline-flex', gap: 2, padding: 3, borderRadius: 6, background: onDark ? 'var(--tc-shell-line-1)' : 'var(--tc-surface-chip)', ...style }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange && onChange(o.value)}
            style={{ flex: stretch ? 1 : undefined, height: h, padding: '0 ' + (h === 24 ? 9 : 10) + 'px', border: 0, borderRadius: 4, background: on ? 'var(--tc-green)' : 'transparent',
              color: on ? 'var(--tc-green-ink)' : onDark ? 'var(--tc-shell-text)' : 'var(--tc-ink)', fontFamily: 'inherit', fontSize: h === 24 ? 11.5 : 12, fontWeight: 600, cursor: 'pointer' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const SEG_HEIGHTS = { xs: 26, sm: 28, md: 30, base: 32, lg: 34 };
export function SegmentedControl({ options = [], value, onChange, size = 'lg', style }: { options?: Opt[]; value?: string; onChange?: (v: string) => void; size?: keyof typeof SEG_HEIGHTS; style?: CSSProperties }) {
  const h = SEG_HEIGHTS[size] || 34;
  const padX = h >= 34 ? 18 : h >= 30 ? 12 : 10;
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--tc-line)', borderRadius: 6, overflow: 'hidden', flex: 'none', ...style }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange && onChange(o.value)}
            style={{ height: h, padding: '0 ' + padX + 'px', border: 0, borderLeft: i ? '1px solid var(--tc-line)' : 0, background: on ? 'var(--tc-ink)' : '#fff',
              color: on ? '#fff' : 'var(--tc-ink-3)', fontFamily: 'inherit', fontSize: h >= 32 ? 13 : 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- domain ----------

export function ChatBubble({ role = 'assistant', children, style }: { role?: 'assistant' | 'user'; children?: ReactNode; style?: CSSProperties }) {
  const user = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: user ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '86%', padding: '10px 12px', borderRadius: 6, background: user ? 'var(--tc-ink)' : 'var(--tc-surface-sunken)', color: user ? '#fff' : 'var(--tc-ink)',
        fontSize: 13, lineHeight: 1.45, textWrap: 'pretty', ...style }}>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value, unit, sub, size = 'lg', style }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; size?: 'md' | 'lg'; style?: CSSProperties }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--tc-line-soft)', borderRadius: 6, padding: '14px 18px', ...style }}>
      <div style={{ fontSize: 12, color: 'var(--tc-ink-5)' }}>{label}</div>
      <div style={{ fontSize: size === 'md' ? 16 : 22, fontWeight: 600, lineHeight: 1.2, marginTop: size === 'md' ? 2 : 0 }}>
        {value} {unit ? <span style={{ fontSize: 13, color: 'var(--tc-ink-5)', fontWeight: 500 }}>{unit}</span> : null}
      </div>
      {sub ? <div style={{ fontSize: 12, color: 'var(--tc-ink-5)' }}>{sub}</div> : null}
    </div>
  );
}

// ---------- forms ----------

export function Field({ label, hint, size = 'md', children, style }: { label: ReactNode; hint?: ReactNode; size?: 'sm' | 'md'; children?: ReactNode; style?: CSSProperties }) {
  const sm = size === 'sm';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: sm ? 4 : 6, fontSize: sm ? 12.5 : 13, fontWeight: 500, minWidth: 0, ...style }}>
      {label}{children}
      {hint ? <span style={{ fontSize: 12, color: 'var(--tc-ink-5)', fontWeight: 400 }}>{hint}</span> : null}
    </label>
  );
}

export function Checkbox({ checked = false, onChange, children, style }: { checked?: boolean; onChange?: (v: boolean) => void; children?: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13.5, cursor: 'pointer', textWrap: 'pretty', ...style }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange && onChange(e.target.checked)} style={{ width: 16, height: 16, margin: '2px 0 0', flex: 'none' }} />
      <span>{children}</span>
    </label>
  );
}

const INPUT_HEIGHTS = { md: 30, lg: 34, '3xl': 42 };
export function Input({ size = 'lg', invalid = false, style, onFocus, onBlur, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> & { size?: keyof typeof INPUT_HEIGHTS; invalid?: boolean; style?: CSSProperties }) {
  const [focus, setFocus] = useState(false);
  const h = INPUT_HEIGHTS[size] || 34;
  return (
    <input {...rest} onFocus={(e) => { setFocus(true); onFocus?.(e); }} onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      style={{ height: h, padding: '0 ' + (h >= 42 ? 12 : h >= 34 ? 10 : 8) + 'px', border: '1px solid ' + (invalid ? 'var(--tc-red)' : 'var(--tc-line)'), borderRadius: 6, background: '#fff',
        fontFamily: 'inherit', fontSize: h >= 42 ? 14 : h >= 34 ? 13 : 12, fontWeight: 400, color: 'var(--tc-ink)', width: '100%', minWidth: 0, boxSizing: 'border-box',
        outline: focus ? '2px solid var(--tc-green)' : 'none', outlineOffset: -1, ...style }} />
  );
}

export function Select({ options = [], size = 'lg', style, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'style'> & { options?: Opt[]; size?: 'md' | 'lg'; style?: CSSProperties }) {
  const h = size === 'md' ? 30 : 34;
  return (
    <select {...rest} style={{ height: h, padding: '0 ' + (h === 30 ? 6 : 8) + 'px', border: '1px solid var(--tc-line)', borderRadius: 6, background: '#fff', fontFamily: 'inherit',
      fontSize: h === 30 ? 12 : 13, fontWeight: 400, color: 'var(--tc-ink)', minWidth: 0, ...style }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Textarea({ minHeight = 64, style, onFocus, onBlur, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> & { minHeight?: number; style?: CSSProperties }) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea {...rest} onFocus={(e) => { setFocus(true); onFocus?.(e); }} onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      style={{ minHeight, padding: '10px 12px', border: '1px solid var(--tc-line)', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 400,
        color: 'var(--tc-ink)', background: '#fff', width: '100%', boxSizing: 'border-box', lineHeight: 1.45, outline: focus ? '2px solid var(--tc-green)' : 'none', outlineOffset: -1, ...style }} />
  );
}

// ---------- indicators ----------

export function Avatar({ initials = '', tone = 'dark', size = 28, style }: { initials?: string; tone?: 'dark' | 'green' | 'white'; size?: number; style?: CSSProperties }) {
  const bg = tone === 'green' ? 'var(--tc-green)' : tone === 'white' ? '#fff' : 'var(--tc-ink)';
  const fg = tone === 'dark' ? '#fff' : 'var(--tc-green-ink)';
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: bg, color: fg, fontSize: size >= 32 ? 12 : 11, fontWeight: 600, display: 'inline-grid',
      placeItems: 'center', flex: 'none', lineHeight: 1, ...style }}>{initials}</span>
  );
}

const DOTS: Record<string, string> = {
  'not-started': 'var(--status-not-started-dot)', 'in-progress': 'var(--status-in-progress-dot)', submitted: 'var(--status-submitted-dot)',
  clarification: 'var(--status-clarification-dot)', accepted: 'var(--status-accepted-dot)', na: 'var(--status-na-dot)',
};
export function DotLegend({ items = [], gap = 14, style }: { items?: { status?: Status; color?: string; label: ReactNode }[]; gap?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', gap, flexWrap: 'wrap', fontSize: 12, color: 'var(--tc-ink-3)', ...style }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: it.color || (it.status && DOTS[it.status]) || 'var(--tc-dot-neutral)', flex: 'none' }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ProgressRing({ value = 0, size = 64, stroke = 7, track = 'var(--tc-surface-muted)', color = 'var(--tc-green)', style }: { value?: number; size?: number; stroke?: number; track?: string; color?: string; style?: CSSProperties }) {
  const r = size / 64 * 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value)), half = size / 2;
  return (
    <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} style={{ flex: 'none', ...style }}>
      <circle cx={half} cy={half} r={r} style={{ fill: 'none', stroke: track, strokeWidth: stroke }} />
      <circle cx={half} cy={half} r={r} transform={'rotate(-90 ' + half + ' ' + half + ')'}
        style={{ fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeDasharray: v * c + ' ' + c }} />
    </svg>
  );
}

const STATUS_LABEL: Record<Status, string> = {
  'not-started': 'Not started', 'in-progress': 'In progress', submitted: 'Submitted', clarification: 'Clarification required', accepted: 'Accepted', na: 'Not applicable',
};
const Check = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" style={{ fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }} /></svg>
);
const Lock = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 16 16">
    <rect x="3" y="7" width="10" height="7" rx="1.5" style={{ fill: 'none', stroke: color, strokeWidth: 1.6 }} />
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" style={{ fill: 'none', stroke: color, strokeWidth: 1.6 }} />
  </svg>
);
export function StatusChip({ status = 'not-started', label, size = 'sm', icon = 'dot', style }: { status?: Status | string; label?: ReactNode; size?: 'xs' | 'sm' | 'md' | 'lg'; icon?: 'dot' | 'check' | 'lock' | 'none' | string; style?: CSSProperties }) {
  const s = (status in STATUS_LABEL ? status : 'not-started') as Status;
  const h = size === 'md' ? 30 : size === 'lg' ? 32 : size === 'xs' ? 22 : 24;
  const fg = 'var(--status-' + s + '-fg)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: h >= 30 ? 8 : 7, height: h, padding: '0 ' + (h >= 30 ? 12 : h <= 22 ? 8 : 10) + 'px', borderRadius: 999,
      fontSize: h >= 30 ? (h === 32 ? 13 : 12.5) : h <= 22 ? 11.5 : 12, fontWeight: 600, background: 'var(--status-' + s + '-bg)', color: fg, whiteSpace: 'nowrap', lineHeight: 1, ...style }}>
      {icon === 'check' ? <Check color={fg} /> : icon === 'lock' ? <Lock color={fg} /> : icon === 'none' ? null
        : <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--status-' + s + '-dot)', flex: 'none' }} />}
      {label || STATUS_LABEL[s]}
    </span>
  );
}

const TAG_TONES: Record<string, { bg: string; fg: string; border?: string; radius?: number; weight?: number; dot?: string }> = {
  neutral: { bg: 'var(--tc-surface-muted)', fg: 'var(--tc-ink-2)' },
  amber: { bg: 'var(--tc-amber-bg)', fg: 'var(--tc-amber-text)' },
  green: { bg: 'var(--tc-green-200)', fg: 'var(--tc-green-text)' },
  orange: { bg: 'var(--tc-orange-bg)', fg: 'var(--tc-orange-text)' },
  blue: { bg: 'var(--tc-blue-bg)', fg: 'var(--tc-blue-text)' },
  muted: { bg: 'var(--tc-line-faint)', fg: 'var(--tc-ink-4)' },
  source: { bg: 'var(--tc-surface-raised)', fg: 'var(--tc-ink-3)', border: '1px solid var(--tc-line-soft)', radius: 4, weight: 400 },
  bundle: { bg: 'var(--tc-surface-sunken)', fg: 'var(--tc-ink-3)', weight: 400, dot: 'var(--tc-green)' },
};
export function Tag({ tone = 'neutral', children, style }: { tone?: string; children?: ReactNode; style?: CSSProperties }) {
  const t = TAG_TONES[tone] || TAG_TONES.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 8px', borderRadius: t.radius || 999, border: t.border || 0, fontSize: 11.5,
      fontWeight: t.weight || 600, background: t.bg, color: t.fg, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', ...style }}>
      {t.dot ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.dot, flex: 'none' }} /> : null}
      {children}
    </span>
  );
}

// ---------- navigation ----------

export function BrandMark({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  const g = Math.round(size * 16 / 28);
  return (
    <span style={{ width: size, height: size, borderRadius: Math.round(size * 6 / 28), background: 'var(--tc-green)', display: 'inline-grid', placeItems: 'center', flex: 'none', ...style }}>
      <svg width={g} height={g} viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" style={{ fill: 'none', stroke: 'var(--tc-green-ink)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} /></svg>
    </span>
  );
}

export function Eyebrow({ children, tone = 'secondary', wide = false, size = 12, style }: { children?: ReactNode; tone?: 'secondary' | 'muted' | 'green'; wide?: boolean; size?: number; style?: CSSProperties }) {
  const color = tone === 'muted' ? 'var(--tc-ink-5)' : tone === 'green' ? 'var(--tc-green-mid)' : 'var(--tc-ink-3)';
  return <div style={{ fontSize: size, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: wide ? '.05em' : '.04em', whiteSpace: 'nowrap', ...style }}>{children}</div>;
}

export function NavGroupHeader({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ padding: '12px 12px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--tc-shell-muted)', textTransform: 'uppercase', letterSpacing: '.06em', ...style }}>{children}</div>;
}

export function NavItem({ label, active = false, badge, count, onClick, style }: { label: ReactNode; active?: boolean; badge?: number; count?: string; onClick?: () => void; style?: CSSProperties }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', padding: '9px 12px 9px 11px', border: 0,
        borderLeft: '3px solid ' + (active ? 'var(--tc-green)' : 'transparent'), borderRadius: 4,
        background: active ? 'var(--tc-shell-active)' : hover ? 'var(--tc-shell-fill-2)' : 'transparent', color: active ? '#fff' : 'var(--tc-shell-nav)',
        fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, textAlign: 'left', cursor: 'pointer', ...style }}>
      <span>{label}</span>
      {badge != null && badge !== 0 ? (
        <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--tc-orange)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'grid', placeItems: 'center' }}>{badge}</span>
      ) : null}
      {count ? <span style={{ fontSize: 11.5, color: 'var(--tc-shell-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{count}</span> : null}
    </button>
  );
}

export function PageTitle({ title, lead, after, actions, size = 'md', leadWidth = 620, style }: { title: ReactNode; lead?: ReactNode; after?: ReactNode; actions?: ReactNode; size?: 'md' | 'lg'; leadWidth?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', ...style }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: size === 'lg' ? 26 : 24, fontWeight: 600, lineHeight: 1.2 }}>{title}</h1>{after}
        </div>
        {lead ? <p style={{ margin: (size === 'lg' ? 6 : 4) + 'px 0 0', color: 'var(--tc-ink-3)', maxWidth: leadWidth, textWrap: 'pretty', fontSize: 14, lineHeight: 1.45 }}>{lead}</p> : null}
      </div>
      {actions ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
    </div>
  );
}

// ---------- surfaces ----------

const BANNER_TONES = {
  success: { bg: 'var(--tc-green-200)', border: '1px solid var(--tc-green-300)', fg: 'var(--tc-green-text)', dot: null },
  info: { bg: 'var(--tc-blue-bg)', border: '1px solid var(--tc-blue-line)', fg: 'var(--tc-blue-text)', dot: 'var(--tc-blue)' },
  warning: { bg: 'var(--tc-amber-bg-soft)', border: '1px solid var(--tc-amber-line)', fg: 'var(--tc-amber-text)', dot: null },
  dark: { bg: 'var(--tc-ink)', border: '0', fg: '#fff', dot: 'var(--tc-green)' },
};
export function Banner({ tone = 'success', title, children, actions, onDismiss, icon, style }: { tone?: keyof typeof BANNER_TONES; title?: ReactNode; children?: ReactNode; actions?: ReactNode; onDismiss?: () => void; icon?: ReactNode; style?: CSSProperties }) {
  const t = BANNER_TONES[tone] || BANNER_TONES.success;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: tone === 'dark' ? '16px 20px' : '14px 18px', borderRadius: 6, background: t.bg, border: t.border,
      color: t.fg, fontSize: 13, ...style }}>
      {icon ? icon : t.dot ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot, flex: 'none' }} /> : null}
      <span style={{ flex: '1 1 320px', minWidth: 0, textWrap: 'pretty', color: tone === 'dark' ? 'var(--tc-shell-text)' : undefined }}>
        {title ? <strong style={{ color: t.fg }}>{title} </strong> : null}{children}
      </span>
      {actions ? <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</span> : null}
      {onDismiss ? <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 0, padding: '0 2px', color: t.fg, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button> : null}
    </div>
  );
}

const CARD_PAD: Record<string, string | number> = { none: 0, md: '14px 18px', lg: '18px 20px', xl: '20px 22px' };
export function Card({ title, subtitle, extra, footer, padding = 'md', dashed = false, flush = false, children, style }: { title?: ReactNode; subtitle?: ReactNode; extra?: ReactNode; footer?: ReactNode; padding?: string; dashed?: boolean; flush?: boolean; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: '#fff', border: '1px ' + (dashed ? 'dashed var(--tc-canvas-profile)' : 'solid var(--tc-line-soft)'), borderBottom: flush ? 0 : undefined, borderRadius: 6,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }}>
      {title || extra ? (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--tc-line-hair)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 12.5, color: 'var(--tc-ink-3)', textWrap: 'pretty' }}>{subtitle}</div> : null}
          </div>
          {extra}
        </div>
      ) : null}
      <div style={{ padding: CARD_PAD[padding] != null ? CARD_PAD[padding] : padding, flex: 1, minWidth: 0 }}>{children}</div>
      {footer ? <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--tc-line-hair)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{footer}</div> : null}
    </div>
  );
}

export function Drawer({ open = true, title, subtitle, onClose, width = 460, scrim = 'light', children, style }: { open?: boolean; title: ReactNode; subtitle?: ReactNode; onClose?: () => void; width?: number; scrim?: 'light' | 'faint' | 'none'; children?: ReactNode; style?: CSSProperties }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 35, display: 'flex', justifyContent: 'flex-end',
      background: scrim === 'none' ? 'transparent' : scrim === 'faint' ? 'var(--scrim-faint)' : 'var(--scrim-light)', pointerEvents: scrim === 'none' ? 'none' : undefined }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: '100%', background: '#fff', height: '100%', overflow: 'auto', padding: '24px 26px 48px', boxShadow: 'var(--shadow-drawer)',
        display: 'flex', flexDirection: 'column', gap: 16, pointerEvents: 'auto', borderLeft: '1px solid var(--tc-line-soft)', ...style }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 13, color: 'var(--tc-ink-3)', marginTop: 2 }}>{subtitle}</div> : null}
          </div>
          {onClose ? <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, fontSize: 20, lineHeight: 1, cursor: 'pointer', color: 'var(--tc-ink-3)', padding: 0 }}>×</button> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function KeyValueList({ rows = [], labelWidth = 150, size = 13, style }: { rows?: { k: ReactNode; v: ReactNode }[]; labelWidth?: number; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: labelWidth + 'px minmax(0,1fr)', gap: '8px 12px', fontSize: size, ...style }}>
      {rows.map((r, i) => (
        <Fragment key={i}>
          <span style={{ color: 'var(--tc-ink-5)' }}>{r.k}</span>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{r.v}</span>
        </Fragment>
      ))}
    </div>
  );
}

// Steps in a row: done steps green, the current one dark, later ones muted.
export function Stepper({ steps = [], current = 0, style }: { steps?: string[]; current?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, overflow: 'hidden', ...style }}>
      {steps.map((label, i) => {
        const done = i < current, now = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: done ? 'var(--tc-green)' : now ? 'var(--tc-ink)' : '#fff', color: done ? 'var(--tc-green-ink)' : now ? '#fff' : 'var(--tc-ink-5)',
              border: '1px solid ' + (done ? 'var(--tc-green)' : now ? 'var(--tc-ink)' : 'var(--tc-line)'), fontSize: 11.5, fontWeight: 600, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: i <= current ? 'var(--tc-ink)' : 'var(--tc-ink-5)' }}>{label}</span>
            {i < steps.length - 1 ? <span style={{ width: 28, height: 1, background: 'var(--tc-line)', marginLeft: 6 }} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function Tabs({ tabs = [], value, onChange, style }: { tabs?: Opt[]; value?: string; onChange?: (v: string) => void; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--tc-line-soft)', ...style }}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button key={t.value} type="button" onClick={() => onChange && onChange(t.value)}
            style={{ height: 40, padding: '0 14px', border: 0, borderBottom: '2px solid ' + (on ? 'var(--tc-green)' : 'transparent'), marginBottom: -1, background: 'none',
              color: on ? 'var(--tc-ink)' : 'var(--tc-ink-3)', fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toast({ children, bottom = 72, style }: { children?: ReactNode; bottom?: number; style?: CSSProperties }) {
  return (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom, transform: 'translateX(-50%)', background: 'var(--tc-ink)', color: '#fff', padding: '10px 16px', borderRadius: 6,
      fontSize: 13, boxShadow: 'var(--shadow-toast)', zIndex: 50, animation: 'tc-toast .18s ease', whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 48px)', overflow: 'hidden',
      textOverflow: 'ellipsis', ...style }}>
      {children}
    </div>
  );
}

// Mirrors the prototype's `style-hover` attribute: merges hoverStyle while the pointer is over the element.
type HoverProps = HTMLAttributes<HTMLElement> & { as?: 'div' | 'span' | 'button'; hoverStyle?: CSSProperties; draggable?: boolean; type?: 'button' };
export function Hover({ as = 'div', style, hoverStyle, ...rest }: HoverProps) {
  const [hover, setHover] = useState(false);
  const El = as;
  // React warns when a longhand (borderColor) toggles over a shorthand (border), so expand it.
  const base = hoverStyle?.borderColor && typeof style?.border === 'string' ? expandBorder(style) : style;
  return <El {...rest} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={hover ? { ...base, ...hoverStyle } : base} />;
}

function expandBorder({ border, ...style }: CSSProperties): CSSProperties {
  const [borderWidth, borderStyle, ...color] = String(border).split(' ');
  return { ...style, borderWidth, borderStyle: borderStyle as CSSProperties['borderStyle'], borderColor: color.join(' ') };
}
