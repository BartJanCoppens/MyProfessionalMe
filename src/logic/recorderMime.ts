// Which video format the browser's MediaRecorder writes (copied from Socials Reel Studio's pickRecorderMime, which fell back
// to webm without asking; here nothing supported is null so the cut can refuse in words). The browser is asked through
// `isSupported` (MediaRecorder.isTypeSupported), so this stays pure.
// MP4 is asked for with its codecs (H.264 and AAC, which Safari and iPhone play) and bare 'video/mp4' is left out: a browser may
// answer yes to it and still write VP9/Opus into the MP4, a file labelled MP4 that Safari cannot play. Such a browser gets webm.
export const RECORDER_MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'];

export const pickRecorderMime = (isSupported: ((m: string) => boolean) | undefined): string | null =>
  (isSupported && RECORDER_MIMES.find((m) => isSupported(m))) || null;

export const extOf = (mime: string): 'mp4' | 'webm' => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');
