// A stand-in for the Supabase client: every query chain is recorded and answered by `db.answer`.
// Use it from a module mock: vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client })).
import { vi } from 'vitest';

export type Call = { table: string; steps: [string, unknown[]][] };
type Result = { data?: unknown; error?: { message: string } | null };
type Answer = (call: Call) => Result | Promise<Result>;

const calls: Call[] = [];
let answer: Answer = () => ({ data: [], error: null });

type Chain = any;
function query(table: string): Chain {
  const call: Call = { table, steps: [] };
  calls.push(call);
  const q: Chain = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (ok: (v: Result) => unknown, ko: (e: unknown) => unknown) => Promise.resolve().then(() => answer(call)).then((r) => ({ data: null, error: null, ...r })).then(ok, ko);
      return (...args: unknown[]) => { call.steps.push([prop, args]); return q; };
    },
  });
  return q;
}

const authListeners: ((event: string, session: unknown) => void)[] = [];
export const db = {
  calls,
  client: {
    from: (table: string) => query(table),
    rpc: (name: string, args?: unknown) => query('rpc:' + name).args(args),
    functions: { invoke: vi.fn(async (_name: string, _opts?: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: { ok: true }, error: null })) },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null as unknown } })),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => { authListeners.push(cb); return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
      signInWithPassword: vi.fn(async (_c: { email: string; password: string }) => ({ error: null as { message: string } | null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
  answer(fn: Answer) { answer = fn; },
  emitAuth(event: string, session: unknown) { authListeners.forEach((l) => l(event, session)); },
  reset() {
    calls.length = 0; authListeners.length = 0; answer = () => ({ data: [], error: null });
    db.client.functions.invoke.mockReset().mockImplementation(async () => ({ data: { ok: true }, error: null }));
    db.client.auth.getSession.mockReset().mockImplementation(async () => ({ data: { session: null } }));
    db.client.auth.signInWithPassword.mockReset().mockImplementation(async () => ({ error: null }));
    db.client.auth.signOut.mockClear();
    db.client.auth.onAuthStateChange.mockClear();
  },
  // The calls made on one table, as "method(args)" chains, e.g. "update({…}).eq(id,L1).select(id)".
  on(table: string) { return calls.filter((c) => c.table === table); },
};

// What a step chain did, e.g. [['eq', ['id', 'L1']]] → has('eq', 'id', 'L1').
export const has = (c: Call, step: string, ...args: unknown[]) => c.steps.some(([s, a]) => s === step && args.every((x, i) => JSON.stringify(a[i]) === JSON.stringify(x)));
export const op = (c: Call) => c.steps[0]?.[0];
