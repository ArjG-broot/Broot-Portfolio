import { createHash } from "node:crypto";
import { getSupabaseKnowledgeClient } from "@/server/knowledge/supabase-client";

const RATE_LIMIT_RPC_TIMEOUT_MS = 2_000;

/** In-memory fallback when the DB is unavailable (per server instance, best-effort only). */
const IN_MEMORY_MAX_PER_MINUTE = 5;
const inMemoryRequestTimestamps = new Map<string, number[]>();

let missingSaltWarned = false;

const FALLBACK_RATE_LIMIT_SALT = "broot-portfolio-rate-limit-salt-change-me";

function readLimitEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export const CHAT_RATE_LIMITS = {
  perMinute: {
    windowSeconds: 60,
    limit: readLimitEnv("RATE_LIMIT_PER_MINUTE", 8),
    keyPrefix: "ip:min:",
  },
  perDay: {
    windowSeconds: 86_400,
    limit: readLimitEnv("RATE_LIMIT_PER_DAY", 80),
    keyPrefix: "ip:day:",
  },
  globalPerDay: {
    windowSeconds: 86_400,
    limit: readLimitEnv("RATE_LIMIT_GLOBAL_PER_DAY", 1500),
    keyPrefix: "global:day",
  },
} as const;

export type RateLimitReason = "per_minute" | "per_day" | "global_day";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: RateLimitReason | null;
  remainingCount?: number;
};

export const RATE_LIMIT_USER_MESSAGES: Record<RateLimitReason, string> = {
  per_minute: "Whoa, too fast! Give me a few seconds and try again.",
  per_day:
    "That's a lot of questions for today! Come back tomorrow, or email Arjit directly.",
  global_day:
    "I'm getting lots of visitors right now. Please try again a bit later.",
};

export function rateLimitUserMessage(
  reason: RateLimitReason | null,
): string {
  if (!reason) {
    return RATE_LIMIT_USER_MESSAGES.per_minute;
  }
  return RATE_LIMIT_USER_MESSAGES[reason];
}

/** Canned chat replies never hit the rate limiter. */
export function shouldRateLimitChatRequest(
  routeKind: "canned" | "model_no_retrieval" | "model_with_retrieval",
): boolean {
  return routeKind !== "canned";
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

function getRateLimitSalt(): string {
  const salt = process.env.RATE_LIMIT_SALT?.trim();
  if (salt) return salt;

  if (!missingSaltWarned) {
    missingSaltWarned = true;
    console.warn(
      "[rate-limit] RATE_LIMIT_SALT is missing; using a built-in fallback. Set RATE_LIMIT_SALT in production.",
    );
  }

  return FALLBACK_RATE_LIMIT_SALT;
}

export function hashKey(ip: string): string {
  return createHash("sha256")
    .update(`${ip}:${getRateLimitSalt()}`)
    .digest("hex");
}

type RpcRow = {
  allowed: boolean;
  current_count: number;
  retry_after_seconds: number;
};

export type RateLimitRpcCaller = (
  key: string,
  windowSeconds: number,
  limit: number,
) => Promise<RpcRow>;

function defaultRpcCaller(
  key: string,
  windowSeconds: number,
  limit: number,
): Promise<RpcRow> {
  const supabase = getSupabaseKnowledgeClient();

  const rpcPromise = supabase.rpc("check_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Rate limit RPC timed out"));
    }, RATE_LIMIT_RPC_TIMEOUT_MS);
  });

  return Promise.race([rpcPromise, timeoutPromise]).then((result) => {
    if (result.error) {
      throw new Error(result.error.message);
    }

    const rows = result.data as RpcRow[] | RpcRow | null;
    const row = Array.isArray(rows) ? rows[0] : rows;

    if (
      !row ||
      typeof row.allowed !== "boolean" ||
      typeof row.current_count !== "number" ||
      typeof row.retry_after_seconds !== "number"
    ) {
      throw new Error("Rate limit RPC returned an unexpected shape");
    }

    return row;
  });
}

function checkInMemoryRateLimit(ipHash: string): RateLimitResult {
  const now = Date.now();
  const windowMs = CHAT_RATE_LIMITS.perMinute.windowSeconds * 1000;
  const existing = inMemoryRequestTimestamps.get(ipHash) ?? [];
  const active = existing.filter((timestamp) => now - timestamp < windowMs);

  if (active.length >= IN_MEMORY_MAX_PER_MINUTE) {
    const oldest = active[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowMs - (now - oldest)) / 1000),
      ),
      reason: "per_minute",
    };
  }

  active.push(now);
  inMemoryRequestTimestamps.set(ipHash, active);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    reason: null,
    remainingCount: IN_MEMORY_MAX_PER_MINUTE - active.length,
  };
}

export function resetInMemoryRateLimitForTests(): void {
  inMemoryRequestTimestamps.clear();
}

export async function checkRateLimit(
  request: Request,
  options?: { rpc?: RateLimitRpcCaller },
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const ipHash = hashKey(ip);
  const rpc = options?.rpc ?? defaultRpcCaller;

  const checks: Array<{
    key: string;
    windowSeconds: number;
    limit: number;
    reason: RateLimitReason;
  }> = [
    {
      key: `${CHAT_RATE_LIMITS.perMinute.keyPrefix}${ipHash}`,
      windowSeconds: CHAT_RATE_LIMITS.perMinute.windowSeconds,
      limit: CHAT_RATE_LIMITS.perMinute.limit,
      reason: "per_minute",
    },
    {
      key: `${CHAT_RATE_LIMITS.perDay.keyPrefix}${ipHash}`,
      windowSeconds: CHAT_RATE_LIMITS.perDay.windowSeconds,
      limit: CHAT_RATE_LIMITS.perDay.limit,
      reason: "per_day",
    },
    {
      key: CHAT_RATE_LIMITS.globalPerDay.keyPrefix,
      windowSeconds: CHAT_RATE_LIMITS.globalPerDay.windowSeconds,
      limit: CHAT_RATE_LIMITS.globalPerDay.limit,
      reason: "global_day",
    },
  ];

  try {
    let minimumRemaining = Number.POSITIVE_INFINITY;

    for (const check of checks) {
      const row = await rpc(check.key, check.windowSeconds, check.limit);

      if (!row.allowed) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(0, row.retry_after_seconds),
          reason: check.reason,
          remainingCount: Math.max(0, check.limit - row.current_count),
        };
      }

      minimumRemaining = Math.min(
        minimumRemaining,
        check.limit - row.current_count,
      );
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      reason: null,
      remainingCount:
        minimumRemaining === Number.POSITIVE_INFINITY
          ? undefined
          : minimumRemaining,
    };
  } catch (error) {
    console.error("[rate-limit] db_rate_limit_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage:
        error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return checkInMemoryRateLimit(ipHash);
  }
}