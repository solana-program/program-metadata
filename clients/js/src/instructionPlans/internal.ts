export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export function getTimedCacheFunction<T>(
  fn: () => Promise<T>,
  timeoutInMilliseconds: number
): () => Promise<T> {
  let cache: T | null = null;
  let lastFetchTime = 0;
  return async () => {
    const currentTime = Date.now();

    // Cache hit.
    if (cache && currentTime - lastFetchTime < timeoutInMilliseconds) {
      return cache;
    }

    // Cache miss.
    cache = await fn();
    lastFetchTime = currentTime;
    return cache;
  };
}
