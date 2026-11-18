// m:ss for a length in seconds. Podcasts and reels play on the step player (fmtPodcast.ts, fmtReel.ts).
export const fmtTime = (x: number) => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');
