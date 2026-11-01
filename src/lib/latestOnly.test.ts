import { describe, expect, it } from 'vitest';
import { latestOnly } from './latestOnly';

const deferred = <T,>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

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
  it('reports a failure only for the most recent request', async () => {
    const errors: string[] = [];
    const run = latestOnly<string>(() => {}, (e) => errors.push((e as Error).message));
    const a = deferred<string>(), b = deferred<string>();
    const pa = run(a.promise), pb = run(b.promise);
    b.reject(new Error('latest')); await pb;
    a.reject(new Error('stale')); await pa;
    expect(errors).toEqual(['latest']);
  });
});
