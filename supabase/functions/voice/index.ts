// The voice adapter: ElevenLabs reads a creator's narration in a stock voice. The key stays here, read from Vault per
// call through the connection that serves the AI use studio_voice; the client never sees it.
//
//   { contributionId, voiceId, text }   any signed-in author: voices up to 5,000 characters in an active stock voice
//                                       and stores the mp3 with their own editable contribution in `media`
//                                       -> { path, seconds, marks }
//   { action: 'sample', voiceId }       System and General Admins: the stock voice's own ElevenLabs preview -> { audio }
//   { action: 'say', runId }            avatar practice, the portrait's voice: the caller's own run's last character line (read by the database, never a
//                                       text from the client) in the scenario's stock voice, counted under avatar_voice -> { audio: base64 mp3 }, stored nowhere
//
// Guard rails (core.ts): the use must be live; the voice must be on the stock list (422); the caller must be allowed to
// write the file, asked with their own token (public.can_write_media) before anything is spent, and the upload itself
// goes with their token so Storage's rules decide again; each person has a daily limit of calls and characters
// (ai_count_call). Answers made by the voice carry X-AI-Generated: true. The text is never logged; a log line holds the
// use, the outcome, the characters and the duration.
import { withSupabase } from '@supabase/server';
import { callerRoles, connectionKey, countCall, fail, isLive, readUse } from '../_shared/aiUse.ts';
import { VOICE_MODEL } from '../_shared/voiceRules.ts';
import { AVATAR_VOICE_USE, sampleResponse, sayResponse, speakResponse, VOICE_LIMITS, VOICE_USE } from './core.ts';
import type { VoiceTarget } from './core.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Use POST');
    const raw = await req.text();
    if (raw.length > VOICE_LIMITS.body) return fail(413, 'The request is too large');
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return fail(400, 'Body must be JSON'); }

    const callerId = ctx.userClaims!.id;
    const admin = ctx.supabaseAdmin, caller = ctx.supabase;
    const liveUse = (name: string) => async () => (await isLive(admin, name)) === true;
    const live = liveUse(VOICE_USE);
    const targetOf = (name: string) => async (): Promise<VoiceTarget | null> => {
      const use = await readUse(admin, name);
      const key = use?.connection ? await connectionKey(admin, use.connection.id) : null;
      return use?.connection && key ? { key, baseUrl: use.connection.base_url, model: use.model || use.connection.default_model || VOICE_MODEL } : null;
    };
    const target = targetOf(VOICE_USE);
    const stockVoice = async (voiceId: string, activeOnly: boolean) => {
      let q = admin.from('stock_voices').select('id').eq('voice_id', voiceId);
      if (activeOnly) q = q.eq('active', true);
      const { data } = await q.maybeSingle();
      return !!data;
    };

    if (body.action === 'sample') {
      const roles = await callerRoles(admin, callerId);
      if (!roles) return fail(500, 'Could not check your roles');
      return sampleResponse(body, { voiceAdmin: roles.includes('system_admin') || roles.includes('general_admin'), onList: (id) => stockVoice(id, false), live, target });
    }

    if (body.action === 'say') {
      return sayResponse(body, {
        live: liveUse(AVATAR_VOICE_USE), target: targetOf(AVATAR_VOICE_USE),
        input: async (runId) => { const { data, error } = await admin.rpc('avatar_say_input', { p_user: callerId, p_run: runId }); return error ? null : data; },
        count: (use, chars) => countCall(admin, callerId, use, chars),
        log: (line) => console.log(JSON.stringify(line)),
      });
    }

    return speakResponse(body, {
      callerId, live, target,
      voiceOnList: (id) => stockVoice(id, true),
      canWrite: async (path) => { const { data, error } = await caller.rpc('can_write_media', { p_path: path }); return !error && data === true; },
      count: (chars) => countCall(admin, callerId, VOICE_USE, chars),
      upload: async (path, bytes) => {
        const { error } = await caller.storage.from('media').upload(path, bytes, { contentType: 'audio/mpeg', upsert: true });
        return error ? error.message : null;
      },
      log: (line) => console.log(JSON.stringify(line)),
    });
  }),
};
