export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
export const GEMINI_EMBEDDING_DIMENSIONS = 768;
export const GEMINI_EMBEDDING_BATCH_SIZE = 8;
export const GEMINI_EMBEDDING_REQUEST_TIMEOUT_MS = 30_000;

const GEMINI_BATCH_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`;

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

type GeminiEmbedding = {
  values?: number[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseEmbeddingVector(
  value: unknown,
  expectedDimensions = GEMINI_EMBEDDING_DIMENSIONS,
): number[] {
  if (!isRecord(value) || !Array.isArray(value.values)) {
    throw new EmbeddingError("Embedding response is missing a values array.");
  }

  const vector = value.values;

  if (vector.length !== expectedDimensions) {
    throw new EmbeddingError(
      `Embedding length ${vector.length} does not match expected ${expectedDimensions}.`,
    );
  }

  if (!vector.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new EmbeddingError("Embedding values must be finite numbers.");
  }

  return vector;
}

export function parseBatchEmbedResponse(
  payload: unknown,
  expectedCount: number,
  expectedDimensions = GEMINI_EMBEDDING_DIMENSIONS,
): number[][] {
  if (!isRecord(payload) || !Array.isArray(payload.embeddings)) {
    throw new EmbeddingError("Batch embedding response is missing embeddings.");
  }

  const embeddings = payload.embeddings as GeminiEmbedding[];

  if (embeddings.length !== expectedCount) {
    throw new EmbeddingError(
      `Expected ${expectedCount} embeddings but received ${embeddings.length}.`,
    );
  }

  return embeddings.map((embedding) =>
    parseEmbeddingVector(embedding, expectedDimensions),
  );
}

function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new EmbeddingError("Missing required environment variable: GEMINI_API_KEY");
  }

  return apiKey;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedBatch(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  const response = await fetch(GEMINI_BATCH_EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    signal: AbortSignal.timeout(GEMINI_EMBEDDING_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        content: {
          parts: [{ text }],
        },
        outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
      })),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const preview = body.slice(0, 200).replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED]");
    throw new EmbeddingError(
      `Gemini embedding request failed with status ${response.status}: ${preview || response.statusText}`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new EmbeddingError("Gemini embedding response was not valid JSON.");
  }

  return parseBatchEmbedResponse(payload, texts.length);
}

async function embedBatchWithRetry(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await embedBatch(apiKey, texts);
    } catch (error) {
      const retryable =
        error instanceof EmbeddingError &&
        /status 429|status 503|status 500/.test(error.message);

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      await sleep(1000 * attempt);
    }
  }

  throw new EmbeddingError("Gemini embedding request failed after retries.");
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (typeof window !== "undefined") {
    throw new EmbeddingError("Embeddings can only be generated on the server.");
  }

  if (texts.length === 0) return [];

  const apiKey = requireGeminiApiKey();
  const vectors: number[][] = [];

  for (let index = 0; index < texts.length; index += GEMINI_EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + GEMINI_EMBEDDING_BATCH_SIZE);
    const batchVectors = await embedBatchWithRetry(apiKey, batch);
    vectors.push(...batchVectors);
  }

  return vectors;
}
