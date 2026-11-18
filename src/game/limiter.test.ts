import { describe, expect, it } from 'vitest';
import { limitedQueue } from './limiter';

describe('limitedQueue', () => {
  it('runs one at a time and refuses beyond the limit', async () => {
    let running = 0, peak = 0;
    const queue = limitedQueue(2);
    const work = () => queue(async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 2)); running--; return 'ok'; });
    const results = await Promise.allSettled([work(), work(), work()]);
    expect(peak).toBe(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect((results[2] as PromiseRejectedResult).reason.message).toBe('Limit reached');
  });
});
