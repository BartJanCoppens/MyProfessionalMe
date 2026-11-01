// Wraps async loads so only the most recent one is applied; earlier ones that resolve later are dropped.
export function latestOnly<T>(apply: (value: T) => void) {
  let ticket = 0;
  return async (load: Promise<T>) => {
    const mine = ++ticket;
    const value = await load;
    if (mine === ticket) apply(value);
  };
}
