import { describe, expect, it } from 'vitest';
import { latestOnly } from './latestOnly';

const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

describe('latestOnly', () => {
  it('applies only the result of the most recent request', async () => {
    const applied: string[] = [];
    const run = latestOnly<string>((v) => applied.push(v));
    const a = deferred<string>(), b = deferred<string>();
    const pa = run(a.promise), pb = run(b.promise);
    b.resolve('B'); await pb;
    a.resolve('A'); await pa;
    expect(applied).toEqual(['B']);
  });
  it('applies a single request', async () => {
    const applied: number[] = [];
    await latestOnly<number>((v) => applied.push(v))(Promise.resolve(7));
    expect(applied).toEqual([7]);
  });
});
