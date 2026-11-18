// Which stage the character is shown on (studios plan, Task 6.6, S4): live video, the stock portrait with a voice, or text only. Voice and video are never a
// condition: the stage drops one rung when the rung above fails or is switched off, and typing works on every rung.
export type Stage = 'video' | 'portrait' | 'text';
export type StageInputs = { videoLive: boolean; videoFailed: boolean; videoOff: boolean; voiceLive: boolean; browserVoice: boolean };

export function stageOf(s: StageInputs): Stage {
  if (s.videoLive && !s.videoFailed && !s.videoOff) return 'video';
  return s.voiceLive || s.browserVoice ? 'portrait' : 'text';
}
