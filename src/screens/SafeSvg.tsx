// The one way a drawing that came from content or an AI reaches the page: sanitised here (src/logic/sanitizeSvg.ts) and
// given ids of its own per rendered copy (React useId), so two drawings on one page never share or reach each other's
// ids. The explainer's steps use it now; Motion's flows next. Nothing renders when nothing survives the sanitiser.
import { useId } from 'react';
import { instance, sanitizeSvg } from '../logic/sanitizeSvg';

export default function SafeSvg({ svg, label, viewBox = '0 0 640 320' }: { svg: string; label: string; viewBox?: string }) {
  const prefix = 'pm' + useId().replace(/\W/g, '');
  const clean = svg ? sanitizeSvg(svg) : '';
  if (!clean) return null;
  return <svg viewBox={viewBox} width="100%" role="img" aria-label={label} style={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: instance(clean, prefix) }} />;
}
