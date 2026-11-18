// Every migration as text, for the tests that check a rule mirrored in TypeScript and SQL.
const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(migrations).sort();

// The match of re in the latest migration that has one (the timestamped names sort in order).
export function latestMatch(re: RegExp): RegExpExecArray {
  for (const f of files.slice().reverse()) { const m = re.exec(migrations[f]); if (m) return m; }
  throw new Error('no migration matches ' + re.source);
}

// One migration's text, by the end of its file name.
export const migrationText = (suffix: string) => migrations[files.find((f) => f.endsWith(suffix))!];
