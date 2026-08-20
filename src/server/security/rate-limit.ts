import { ApiError } from "../http/envelope";

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export function assertRateLimit(key: string, limit: number, windowMs: number, timestamp = Date.now()): void {
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= timestamp ? { count: 0, resetAt: timestamp + windowMs } : current;
  if (bucket.count >= limit) {
    throw new ApiError("RATE_LIMITED", "Muitas tentativas. Aguarde antes de tentar novamente.", 429, { retryable: true });
  }
  buckets.set(key, { ...bucket, count: bucket.count + 1 });
  if (buckets.size > 10_000) {
    for (const [bucketKey, entry] of buckets) if (entry.resetAt <= timestamp) buckets.delete(bucketKey);
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
