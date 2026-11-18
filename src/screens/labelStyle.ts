import type { CSSProperties } from 'react';
// The small uppercase label used across the Create & share screens.
export const label = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase' as const, letterSpacing: '.04em' };
// The small square button of a list row (↑ ↓ ×).
export const iconButton: CSSProperties = { width: 28, height: 28, border: '1px solid #d5dacf', borderRadius: 4, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13, color: '#1a1d18', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
