export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_RETRY_BACKOFF_MS = [400, 1000] as const;
export const GEMINI_FALLBACK_RETRY_BACKOFF_MS = [400] as const;
export const GEMINI_TOTAL_DEADLINE_MS = 25_000;
export const BROOT_UNAVAILABLE_MESSAGE =
  "Broot is having a moment. Please try again in a few seconds.";

export type FetchFn = typeof fetch;

export function resolvePrimaryGeminiModel(): string {
  const fromEnv = process.env.GEMINI_MODEL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_GEMINI_MODEL;
}

export function resolveFallbackGeminiModel(): string | undefined {
  const fromEnv = process.env.GEMINI_FALLBACK_MODEL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : undefined;
}

export function buildGeminiGenerateUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export function isRetriableGeminiStatus(status: number): boolean {
  return status === 503 || status === 429 || status === 500;
}

export function isNonRetryableGeminiClientStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

function isFetchTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  return false;
}

export type CallGeminiResult =
  | { ok: true; response: Response }
  | { ok: false; kind: "network" | "timeout"; error: unknown };

export async function callGemini(
  model: string,
  body: unknown,
  options: {
    apiKey: string;
    timeoutMs: number;
    fetchImpl?: FetchFn;
  },
): Promise<CallGeminiResult> {
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(buildGeminiGenerateUrl(model), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.apiKey,
      },
      signal: AbortSignal.timeout(Math.max(1, options.timeoutMs)),
      body: JSON.stringify(body),
    });

    return { ok: true, response };
  } catch (error) {
    return {
      ok: false,
      kind: isFetchTimeoutError(error) ? "timeout" : "network",
      error,
    };
  }
}

export type GenerateWithFallbackSuccess = {
  ok: true;
  model: string;
  response: Response;
  attempts: number;
  latencyMs: number;
};

export type GenerateWithFallbackFailure = {
  ok: false;
  modelsTried: string[];
  statuses: number[];
  attempts: number;
  latencyMs: number;
};

type ModelAttemptResult =
  | { kind: "success"; response: Response; attempts: number }
  | { kind: "model_gone"; attempts: number; statuses: number[] }
  | { kind: "client_error"; status: number; attempts: number }
  | { kind: "exhausted"; attempts: number; statuses: number[] };

async function runModelAttempts(
  model: string,
  body: unknown,
  options: {
    apiKey: string;
    perAttemptTimeoutMs: number;
    deadlineMs: number;
    maxAttempts: number;
    backoffs: readonly number[];
    fetchImpl?: FetchFn;
    now: () => number;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<ModelAttemptResult> {
  const statuses: number[] = [];

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const remaining = options.deadlineMs - options.now();
    if (remaining <= 0) {
      return { kind: "exhausted", attempts: attempt, statuses };
    }

    const attemptTimeoutMs = Math.min(
      options.perAttemptTimeoutMs,
      remaining,
    );

    const result = await callGemini(model, body, {
      apiKey: options.apiKey,
      timeoutMs: attemptTimeoutMs,
      fetchImpl: options.fetchImpl,
    });

    if (!result.ok) {
      statuses.push(-1);
      if (attempt < options.maxAttempts - 1) {
        const backoff = options.backoffs[attempt] ?? 0;
        const waitMs = Math.min(backoff, options.deadlineMs - options.now());
        if (waitMs > 0) {
          await options.sleep(waitMs);
        }
        continue;
      }
      return { kind: "exhausted", attempts: attempt + 1, statuses };
    }

    const { response } = result;
    statuses.push(response.status);

    if (response.ok) {
      return { kind: "success", response, attempts: attempt + 1 };
    }

    if (isNonRetryableGeminiClientStatus(response.status)) {
      return { kind: "client_error", status: response.status, attempts: attempt + 1 };
    }

    if (response.status === 404) {
      return { kind: "model_gone", attempts: attempt + 1, statuses };
    }

    if (
      isRetriableGeminiStatus(response.status) &&
      attempt < options.maxAttempts - 1
    ) {
      const backoff = options.backoffs[attempt] ?? 0;
      const waitMs = Math.min(backoff, options.deadlineMs - options.now());
      if (waitMs > 0) {
        await options.sleep(waitMs);
      }
      continue;
    }

    return { kind: "exhausted", attempts: attempt + 1, statuses };
  }

  return { kind: "exhausted", attempts: options.maxAttempts, statuses };
}

export async function generateWithFallback(
  body: unknown,
  options: {
    apiKey: string;
    primaryModel?: string;
    fallbackModel?: string;
    perAttemptTimeoutMs: number;
    totalDeadlineMs?: number;
    fetchImpl?: FetchFn;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<GenerateWithFallbackSuccess | GenerateWithFallbackFailure> {
  const start = (options.now ?? Date.now)();
  const deadlineMs =
    start + (options.totalDeadlineMs ?? GEMINI_TOTAL_DEADLINE_MS);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const primaryModel = options.primaryModel ?? resolvePrimaryGeminiModel();
  const fallbackModel = options.fallbackModel ?? resolveFallbackGeminiModel();

  const modelsTried: string[] = [];
  const statuses: number[] = [];
  let totalAttempts = 0;

  const attemptOptions = {
    apiKey: options.apiKey,
    perAttemptTimeoutMs: options.perAttemptTimeoutMs,
    deadlineMs,
    fetchImpl: options.fetchImpl,
    now,
    sleep,
  };

  modelsTried.push(primaryModel);
  const primaryResult = await runModelAttempts(primaryModel, body, {
    ...attemptOptions,
    maxAttempts: 3,
    backoffs: GEMINI_RETRY_BACKOFF_MS,
  });

  totalAttempts += primaryResult.attempts;
  if ("statuses" in primaryResult) {
    statuses.push(...primaryResult.statuses);
  } else if (primaryResult.kind === "client_error") {
    statuses.push(primaryResult.status);
  }

  if (primaryResult.kind === "success") {
    return {
      ok: true,
      model: primaryModel,
      response: primaryResult.response,
      attempts: totalAttempts,
      latencyMs: now() - start,
    };
  }

  if (primaryResult.kind === "client_error") {
    return {
      ok: false,
      modelsTried,
      statuses,
      attempts: totalAttempts,
      latencyMs: now() - start,
    };
  }

  const shouldTryFallback =
    fallbackModel !== undefined &&
    (primaryResult.kind === "model_gone" || primaryResult.kind === "exhausted");

  if (!shouldTryFallback) {
    return {
      ok: false,
      modelsTried,
      statuses,
      attempts: totalAttempts,
      latencyMs: now() - start,
    };
  }

  modelsTried.push(fallbackModel);
  const fallbackResult = await runModelAttempts(fallbackModel, body, {
    ...attemptOptions,
    maxAttempts: 2,
    backoffs: GEMINI_FALLBACK_RETRY_BACKOFF_MS,
  });

  totalAttempts += fallbackResult.attempts;
  if ("statuses" in fallbackResult) {
    statuses.push(...fallbackResult.statuses);
  } else if (fallbackResult.kind === "client_error") {
    statuses.push(fallbackResult.status);
  }

  if (fallbackResult.kind === "success") {
    return {
      ok: true,
      model: fallbackModel,
      response: fallbackResult.response,
      attempts: totalAttempts,
      latencyMs: now() - start,
    };
  }

  return {
    ok: false,
    modelsTried,
    statuses,
    attempts: totalAttempts,
    latencyMs: now() - start,
  };
}