// Wraps async loads so only the most recent one is applied; earlier ones that resolve or fail later are dropped.
// With onError, a failure of the most recent load is reported instead of thrown.
export function latestOnly<T>(apply: (value: T) => void, onError?: (error: unknown) => void) {
  let ticket = 0;
  return async (load: Promise<T>) => {
    const mine = ++ticket;
    let value: T;
    try { value = await load; } catch (error) {
      if (!onError) throw error;
      if (mine === ticket) onError(error);
      return;
    }
    if (mine === ticket) apply(value);
  };
}
