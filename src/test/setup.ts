// Runs before every test file: the Supabase client is always the in-memory fake, so no test can reach a real project.
import { vi } from 'vitest';

vi.mock('@supabase/supabase-js', async () => { const { db } = await import('./fakeSupabase'); return { createClient: () => db.client }; });
