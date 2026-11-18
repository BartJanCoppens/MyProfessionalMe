// A cut that is made first (it may fetch fresh links) and then rendered: the one path of the Slides video and the Reel's final cut. When the
// making fails, the audio context opened in the click is closed here, as renderCut closes it from then on.
import { renderCut } from './compositor';
import type { CutResult, RenderOptions } from './compositor';
import type { Cut } from './cutRules';

export async function renderBuiltCut(build: () => Promise<Cut>, o: RenderOptions): Promise<CutResult> {
  let cut: Cut;
  try { cut = await build(); } catch (e) { void o.context?.close().catch(() => {}); throw e; }
  return renderCut(cut, o);
}
