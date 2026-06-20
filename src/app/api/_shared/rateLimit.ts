import { tooManyRequests } from "./http";

type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const MAX_BUCKETS = 2_000;

const buckets = new Map<string, Bucket>();

const firstForwardedValue = (value: string | null): string | null =>
  value?.split(",")[0]?.trim() || null;

const clientIp = (request: Request): string =>
  firstForwardedValue(request.headers.get("x-nf-client-connection-ip")) ??
  firstForwardedValue(request.headers.get("x-forwarded-for")) ??
  request.headers.get("x-real-ip") ??
  "unknown";

const routeKey = (request: Request): string => new URL(request.url).pathname;

const pruneExpiredBuckets = (now: number) => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

export const checkRateLimit = (
  request: Request,
  now = Date.now(),
): Response | null => {
  if (buckets.size > MAX_BUCKETS) pruneExpiredBuckets(now);

  const key = `${clientIp(request)}:${routeKey(request)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS_PER_WINDOW) return tooManyRequests();

  return null;
};
