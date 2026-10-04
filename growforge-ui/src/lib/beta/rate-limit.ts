import { NextResponse } from "next/server";
import { normalizeBetaEmail } from "./identity";

export type BetaRateLimitOp = "chat" | "byok_test" | "byok_save";

export interface RateLimitConfig {
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  retryAfter: number; // in seconds
  errorResponse?: NextResponse;
}

// Configurable default thresholds for private beta operations
const DEFAULT_LIMITS: Record<BetaRateLimitOp, RateLimitConfig> = {
  chat: {
    limit: Number(process.env.BETA_RATELIMIT_CHAT_LIMIT) || 30, // 30 requests / min
    windowSec: Number(process.env.BETA_RATELIMIT_CHAT_WINDOW_SEC) || 60,
  },
  byok_test: {
    limit: Number(process.env.BETA_RATELIMIT_BYOK_TEST_LIMIT) || 10, // 10 test calls / min
    windowSec: Number(process.env.BETA_RATELIMIT_BYOK_TEST_WINDOW_SEC) || 60,
  },
  byok_save: {
    limit: Number(process.env.BETA_RATELIMIT_BYOK_SAVE_LIMIT) || 10, // 10 saves / min
    windowSec: Number(process.env.BETA_RATELIMIT_BYOK_SAVE_WINDOW_SEC) || 60,
  },
};

function getOpConfig(op: BetaRateLimitOp, override?: Partial<RateLimitConfig>): RateLimitConfig {
  const base = DEFAULT_LIMITS[op] || { limit: 20, windowSec: 60 };
  return {
    limit: override?.limit ?? base.limit,
    windowSec: override?.windowSec ?? base.windowSec,
  };
}

function upstash(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

// Lua script for atomic sliding/fixed window rate limit counter
const LUA_RATE_LIMIT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowSec = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, windowSec)
end

local ttl = redis.call('TTL', key)
if ttl < 0 then
  redis.call('EXPIRE', key, windowSec)
  ttl = windowSec
end

if current > limit then
  return {0, current, ttl}
else
  return {1, current, ttl}
end
`;

// In-memory fallback map for local development and non-redis test execution
interface LocalBucket {
  count: number;
  resetAt: number;
}
const localBuckets = new Map<string, LocalBucket>();

/**
 * Resets local in-memory rate limit buckets (for testing).
 */
export function clearBetaRateLimits(): void {
  localBuckets.clear();
}

/**
 * Checks and increments the rate limit for an authenticated tester on a specific beta operation.
 * Primary identity MUST come from authenticated session email (normalized), never from untrusted client input.
 */
export async function checkBetaRateLimit(
  authenticatedEmail: string,
  op: BetaRateLimitOp,
  override?: Partial<RateLimitConfig>
): Promise<RateLimitResult> {
  const normalized = normalizeBetaEmail(authenticatedEmail);
  if (!normalized) {
    throw new Error("Cannot rate limit an unauthenticated/empty identity.");
  }

  const { limit, windowSec } = getOpConfig(op, override);
  const u = upstash();
  const redisKey = `growforge:beta:v2:ratelimit:${op}:${normalized}`;

  if (u) {
    try {
      const res = await fetch(u.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${u.token}`, "content-type": "application/json" },
        body: JSON.stringify(["EVAL", LUA_RATE_LIMIT, 1, redisKey, limit, windowSec]),
        cache: "no-store",
      });
      const data = (await res.json()) as { result?: [number, number, number]; error?: string };
      if (res.ok && Array.isArray(data.result)) {
        const [allowedFlag, currentCount, ttlSec] = data.result;
        const allowed = allowedFlag === 1;
        const current = Number(currentCount) || 1;
        const retryAfter = Math.max(1, Number(ttlSec) || windowSec);
        const remaining = Math.max(0, limit - current);

        if (!allowed) {
          return {
            allowed: false,
            limit,
            current,
            remaining: 0,
            retryAfter,
            errorResponse: NextResponse.json(
              {
                error: "rate_limited",
                code: "rate_limit_exceeded",
                message: `Too many requests for ${op}. Please retry in ${retryAfter}s.`,
                retryAfter,
              },
              {
                status: 429,
                headers: {
                  "Retry-After": String(retryAfter),
                  "X-RateLimit-Limit": String(limit),
                  "X-RateLimit-Remaining": "0",
                  "X-RateLimit-Reset": String(retryAfter),
                },
              }
            ),
          };
        }

        return {
          allowed: true,
          limit,
          current,
          remaining,
          retryAfter: 0,
        };
      }
    } catch (err) {
      // If Upstash fails transiently, fail-safe: permit request but log if needed
      console.warn("Beta rate limit Redis evaluation error:", err);
    }
  }

  // Local / in-memory fallback
  const memKey = `${op}:${normalized}`;
  const now = Date.now();
  let bucket = localBuckets.get(memKey);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + windowSec * 1000 };
    localBuckets.set(memKey, bucket);
    return {
      allowed: true,
      limit,
      current: 1,
      remaining: Math.max(0, limit - 1),
      retryAfter: 0,
    };
  }

  bucket.count += 1;
  const current = bucket.count;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const remaining = Math.max(0, limit - current);

  if (current > limit) {
    return {
      allowed: false,
      limit,
      current,
      remaining: 0,
      retryAfter,
      errorResponse: NextResponse.json(
        {
          error: "rate_limited",
          code: "rate_limit_exceeded",
          message: `Too many requests for ${op}. Please retry in ${retryAfter}s.`,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(retryAfter),
          },
        }
      ),
    };
  }

  return {
    allowed: true,
    limit,
    current,
    remaining,
    retryAfter: 0,
  };
}
