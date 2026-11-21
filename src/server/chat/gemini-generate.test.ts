import assert from "node:assert/strict";
import test from "node:test";
import {
  BROOT_UNAVAILABLE_MESSAGE,
  buildGeminiGenerateUrl,
  generateWithFallback,
  type FetchFn,
} from "@/server/chat/gemini-generate";

const PRIMARY = "gemini-primary";
const FALLBACK = "gemini-fallback";
const BODY = { contents: [] };

function jsonResponse(status: number, payload: unknown = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): FetchFn {
  return ((url: string, init?: RequestInit) =>
    Promise.resolve(handler(url, init))) as FetchFn;
}

test("generateWithFallback succeeds on first try", async () => {
  let calls = 0;
  const fetchImpl = mockFetch((url) => {
    calls += 1;
    assert.match(url, new RegExp(PRIMARY));
    return jsonResponse(200, { candidates: [] });
  });

  const result = await generateWithFallback(BODY, {
    apiKey: "test-key",
    primaryModel: PRIMARY,
    perAttemptTimeoutMs: 20_000,
    fetchImpl,
    sleep: async () => {},
    now: (() => {
      let t = 1_000;
      return () => t;
    })(),
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model, PRIMARY);
    assert.equal(result.attempts, 1);
  }
});

test("generateWithFallback retries 503 then succeeds on primary", async () => {
  let calls = 0;
  const fetchImpl = mockFetch(() => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse(503);
    }
    return jsonResponse(200, { ok: true });
  });

  const sleeps: number[] = [];
  const result = await generateWithFallback(BODY, {
    apiKey: "test-key",
    primaryModel: PRIMARY,
    perAttemptTimeoutMs: 20_000,
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: (() => {
      let t = 0;
      return () => {
        t += 50;
        return t;
      };
    })(),
  });

  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [400]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model, PRIMARY);
    assert.equal(result.attempts, 2);
  }
});

test("generateWithFallback uses fallback after primary 503 exhausts retries", async () => {
  const calls: { model: string }[] = [];
  const fetchImpl = mockFetch((url) => {
    const model = url.includes(FALLBACK) ? FALLBACK : PRIMARY;
    calls.push({ model });

    if (model === PRIMARY) {
      return jsonResponse(503);
    }

    return jsonResponse(200, { from: "fallback" });
  });

  const result = await generateWithFallback(BODY, {
    apiKey: "test-key",
    primaryModel: PRIMARY,
    fallbackModel: FALLBACK,
    perAttemptTimeoutMs: 20_000,
    fetchImpl,
    sleep: async () => {},
    now: (() => {
      let t = 0;
      return () => {
        t += 10;
        return t;
      };
    })(),
  });

  assert.equal(calls.filter((c) => c.model === PRIMARY).length, 3);
  assert.equal(calls.filter((c) => c.model === FALLBACK).length, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model, FALLBACK);
  }
});

test("generateWithFallback switches to fallback on primary 404", async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const fetchImpl = mockFetch((url) => {
    if (url.includes(PRIMARY)) {
      primaryCalls += 1;
      return jsonResponse(404);
    }
    fallbackCalls += 1;
    return jsonResponse(200, { ok: true });
  });

  const result = await generateWithFallback(BODY, {
    apiKey: "test-key",
    primaryModel: PRIMARY,
    fallbackModel: FALLBACK,
    perAttemptTimeoutMs: 20_000,
    fetchImpl,
    sleep: async () => {},
    now: () => Date.now(),
  });

  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model, FALLBACK);
  }
});

test("generateWithFallback does not retry HTTP 400", async () => {
  let calls = 0;
  const fetchImpl = mockFetch(() => {
    calls += 1;
    return jsonResponse(400);
  });

  const result = await generateWithFallback(BODY, {
    apiKey: "test-key",
    primaryModel: PRIMARY,
    fallbackModel: FALLBACK,
    perAttemptTimeoutMs: 20_000,
    fetchImpl,
    sleep: async () => {},
    now: () => Date.now(),
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.statuses, [400]);
    assert.deepEqual(result.modelsTried, [PRIMARY]);
  }
});

test("generateWithFallback reports failure when all attempts fail", async () => {
  const fetchImpl = mockFetch(() => jsonResponse(503));

  const result = await generateWithFallback(BODY, {
    apiKey: "test-key",
    primaryModel: PRIMARY,
    fallbackModel: FALLBACK,
    perAttemptTimeoutMs: 20_000,
    fetchImpl,
    sleep: async () => {},
    now: (() => {
      let t = 0;
      return () => {
        t += 5;
        return t;
      };
    })(),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.modelsTried, [PRIMARY, FALLBACK]);
    assert.ok(result.statuses.length >= 4);
    assert.equal(
      BROOT_UNAVAILABLE_MESSAGE,
      "Broot is having a moment. Please try again in a few seconds.",
    );
  }
});

test("buildGeminiGenerateUrl encodes model in path", () => {
  const url = buildGeminiGenerateUrl("gemini-3.5-flash-lite");
  assert.match(url, /models\/gemini-3\.5-flash-lite:generateContent$/);
});