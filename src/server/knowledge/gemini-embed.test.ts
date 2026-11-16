import assert from "node:assert/strict";
import test from "node:test";
import {
  EmbeddingError,
  GEMINI_EMBEDDING_DIMENSIONS,
  parseBatchEmbedResponse,
  parseEmbeddingVector,
} from "./gemini-embed";

function vector(size = GEMINI_EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length: size }, (_, index) => index / size);
}

test("parseEmbeddingVector accepts a valid vector", () => {
  const values = vector();
  assert.deepEqual(parseEmbeddingVector({ values }), values);
});

test("parseEmbeddingVector rejects wrong dimensions", () => {
  assert.throws(
    () => parseEmbeddingVector({ values: [0.1, 0.2] }),
    EmbeddingError,
  );
});

test("parseBatchEmbedResponse preserves order and count", () => {
  const payload = {
    embeddings: [{ values: vector() }, { values: vector() }],
  };

  const result = parseBatchEmbedResponse(payload, 2);
  assert.equal(result.length, 2);
});

test("parseBatchEmbedResponse rejects malformed payloads", () => {
  assert.throws(() => parseBatchEmbedResponse({}, 1), EmbeddingError);
  assert.throws(
    () => parseBatchEmbedResponse({ embeddings: [{ values: vector() }] }, 2),
    EmbeddingError,
  );
});
