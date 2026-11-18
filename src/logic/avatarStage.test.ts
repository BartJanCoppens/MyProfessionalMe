import { describe, expect, it } from 'vitest';
import { stageOf } from './avatarStage';

const base = { videoLive: false, videoFailed: false, videoOff: false, voiceLive: false, browserVoice: false };

describe('stageOf: the highest rung that works, never a dead end', () => {
  it('is the video when it is live and neither failed nor switched off', () => expect(stageOf({ ...base, videoLive: true })).toBe('video'));
  it('drops to the portrait when the video failed and the voice is live', () => expect(stageOf({ ...base, videoLive: true, videoFailed: true, voiceLive: true })).toBe('portrait'));
  it('drops to the portrait with the browser voice when the voice is off', () => expect(stageOf({ ...base, browserVoice: true })).toBe('portrait'));
  it('is text when there is no video, no voice and no browser voice', () => expect(stageOf(base)).toBe('text'));
  it('drops to the portrait when the learner switched the video off', () => expect(stageOf({ ...base, videoLive: true, videoOff: true, voiceLive: true })).toBe('portrait'));
});
