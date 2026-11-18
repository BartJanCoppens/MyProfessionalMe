// Which video format the browser's MediaRecorder writes (copied from Socials Reel Studio's pickRecorderMime, which fell back
// to webm without asking; here nothing supported is null so the cut can refuse in words). The browser is asked through
// `isSupported` (MediaRecorder.isTypeSupported), so this stays pure.
export const RECORDER_MIMES = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];

export const pickRecorderMime = (isSupported: ((m: string) => boolean) | undefined): string | null =>
  (isSupported && RECORDER_MIMES.find((m) => isSupported(m))) || null;

export const extOf = (mime: string): 'mp4' | 'webm' => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');
