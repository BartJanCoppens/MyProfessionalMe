// The voice rules the `voice` edge function and the app share (one copy): the AI use it serves, the provider voice ids
// it accepts (as stock_voices.voice_id in 20261117280000_voice_adapter.sql; src/logic/ai.test.ts checks the migration),
// and the ElevenLabs model it uses unless the use or its connection names another.
export const VOICE_USE = 'studio_voice';
// The portrait's voice in avatar practice: speaks the character's line when the live video is not used or fails.
export const AVATAR_VOICE_USE = 'avatar_voice';
export const VOICE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const VOICE_MODEL = 'eleven_multilingual_v2';
// The longest stored clip, in seconds: the function refuses audio of 0 s or more than this, so a stored clip is always one
// the clip model accepts (src/logic/voiceItem.ts, private.voice_ok), and one bad clip cannot make a whole voice-over invalid.
export const CLIP_SECONDS_MAX = 180;
// The most words a clip holds timings for (clip.words): its text is at most 600 characters, so this is never the limit in
// practice; private.voice_ok (20261118160000_voice_words.sql) repeats it.
export const CLIP_WORDS_MAX = 300;
