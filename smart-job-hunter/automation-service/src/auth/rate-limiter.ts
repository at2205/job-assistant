// =============================================
// Rate Limiter (Redis-backed)
// =============================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// In-memory fallback (when Redis is unavailable)
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.expiresAt < now) {
    // New window
    memoryStore.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: new Date(now + windowMs) };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.expiresAt) };
  }

  return { allowed: true, remaining, resetAt: new Date(entry.expiresAt) };
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60000);

// ---- Pre-configured limiters ----
export const rateLimiters = {
  apply: (userId: string) => checkRateLimit(`apply:${userId}`, 15, 86400000),   // 15/day
  scrape: (userId: string) => checkRateLimit(`scrape:${userId}`, 10, 86400000), // 10/day
  generate: (userId: string) => checkRateLimit(`gen:${userId}`, 50, 86400000),  // 50/day
  login: (ip: string) => checkRateLimit(`login:${ip}`, 5, 900000),             // 5/15min
  api: (userId: string) => checkRateLimit(`api:${userId}`, 100, 60000),        // 100/min
};
