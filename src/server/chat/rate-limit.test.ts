import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  hashKey,
  resetInMemoryRateLimitForTests,
  shouldRateLimitChatRequest,
  type RateLimitRpcCaller,
} from "@/server/chat/rate-limit";

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
  });
}

test("getClientIp uses the first x-forwarded-for address", () => {
  const request = requestWithHeaders({
    "x-forwarded-for": " 203.0.113.1, 198.51.100.2 ",
  });
  assert.equal(getClientIp(request), "203.0.113.1");
});

test("hashKey does not return the raw IP", () => {
  const ip = "203.0.113.1";
  const hashed = hashKey(ip);
  assert.notEqual(hashed, ip);
  assert.match(hashed, /^[a-f0-9]{64}$/);
});

test("shouldRateLimitChatRequest skips canned replies", () => {
  assert.equal(shouldRateLimitChatRequest("canned"), false);
  assert.equal(shouldRateLimitChatRequest("model_no_retrieval"), true);
  assert.equal(shouldRateLimitChatRequest("model_with_retrieval"), true);
});

test("checkRateLimit allows requests under the per-minute limit", async () => {
  resetInMemoryRateLimitForTests();
  const rpc: RateLimitRpcCaller = async () => ({
    allowed: true,
    current_count: 1,
    retry_after_seconds: 59,
  });

  const result = await checkRateLimit(
    requestWithHeaders({ "x-real-ip": "10.0.0.1" }),
    { rpc },
  );

  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
});

test("checkRateLimit blocks per-minute overflow with retry time", async () => {
  const rpc: RateLimitRpcCaller = async (key) => {
    if (key.startsWith(CHAT_RATE_LIMITS.perMinute.keyPrefix)) {
      return {
        allowed: false,
        current_count: CHAT_RATE_LIMITS.perMinute.limit + 1,
        retry_after_seconds: 17,
      };
    }
    return { allowed: true, current_count: 1, retry_after_seconds: 0 };
  };

  const result = await checkRateLimit(
    requestWithHeaders({ "x-real-ip": "10.0.0.2" }),
    { rpc },
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "per_minute");
  assert.equal(result.retryAfterSeconds, 17);
});

test("checkRateLimit returns per_day reason", async () => {
  const rpc: RateLimitRpcCaller = async (key) => {
    if (key.startsWith(CHAT_RATE_LIMITS.perDay.keyPrefix)) {
      return {
        allowed: false,
        current_count: 81,
        retry_after_seconds: 3600,
      };
    }
    return { allowed: true, current_count: 1, retry_after_seconds: 0 };
  };

  const result = await checkRateLimit(
    requestWithHeaders({ "x-real-ip": "10.0.0.3" }),
    { rpc },
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "per_day");
});

test("checkRateLimit returns global_day reason", async () => {
  const rpc: RateLimitRpcCaller = async (key) => {
    if (key === CHAT_RATE_LIMITS.globalPerDay.keyPrefix) {
      return {
        allowed: false,
        current_count: 1501,
        retry_after_seconds: 7200,
      };
    }
    return { allowed: true, current_count: 1, retry_after_seconds: 0 };
  };

  const result = await checkRateLimit(
    requestWithHeaders({ "x-real-ip": "10.0.0.4" }),
    { rpc },
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "global_day");
});

test("checkRateLimit falls back to in-memory limiter when RPC fails", async () => {
  resetInMemoryRateLimitForTests();
  const rpc: RateLimitRpcCaller = async () => {
    throw new Error("database unavailable");
  };

  const request = requestWithHeaders({ "x-real-ip": "10.0.0.5" });

  for (let index = 0; index < 5; index += 1) {
    const attempt = await checkRateLimit(request, { rpc });
    assert.equal(attempt.allowed, true, `expected attempt ${index + 1} to pass`);
  }

  const blocked = await checkRateLimit(request, { rpc });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "per_minute");
  assert.ok(blocked.retryAfterSeconds >= 1);
});