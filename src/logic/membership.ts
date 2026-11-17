// Industry and technology membership: the audiences a counsellor or admin sets for a person (the ind and tec lists of
// AUDS), the format the database checks (audience_members, supabase/migrations/*_audience_members.sql) and the audience
// keys a person belongs to. Pure rules; trajectory.sync.test.ts checks the pattern against the migration.
import { AUDS } from '../data';

export const MEMBERSHIP_PATTERN = /^(ind|tec):[a-z]+$/;
export const MEMBERSHIP_AUDIENCES: { key: string; name: string }[] = [...AUDS.ind, ...AUDS.tec].map((a) => ({ key: a[0], name: a[1] }));

// A person's audiences for trajectory relevance: their business line, then their memberships.
export const audienceKeys = (line: string | null, audiences: string[]): string[] => (line ? [line] : []).concat(audiences);
