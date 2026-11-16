import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeDocument } from "./document";
import {
  buildKnowledgeChunkRows,
  knowledgeChunkFromDocument,
  KnowledgeChunkError,
} from "./knowledge-chunks";
import { GEMINI_EMBEDDING_DIMENSIONS } from "./gemini-embed";

function chunkDoc(): KnowledgeDocument {
  return {
    id: "dossier:1:chunk:0",
    pageContent: "Chunk body",
    metadata: {
      sourceId: "Developer_and_Personal_Growth_Dossier",
      section: "Projects",
      documentId: "dossier:1",
      chunkIndex: 0,
    },
  };
}

test("maps a chunk into the database row shape", () => {
  const embedding = Array.from({ length: GEMINI_EMBEDDING_DIMENSIONS }, () => 0.1);
  const row = knowledgeChunkFromDocument(
    chunkDoc(),
    embedding,
    "2026-01-01T00:00:00.000Z",
  );

  assert.equal(row.id, "dossier:1:chunk:0");
  assert.equal(row.source_id, "Developer_and_Personal_Growth_Dossier");
  assert.equal(row.document_id, "dossier:1");
  assert.equal(row.chunk_index, 0);
  assert.equal(row.section, "Projects");
  assert.equal(row.content, "Chunk body");
  assert.equal(row.embedding_model, "gemini-embedding-001");
});

test("buildKnowledgeChunkRows requires matching counts", () => {
  assert.throws(
    () =>
      buildKnowledgeChunkRows(
        [chunkDoc()],
        [],
        "2026-01-01T00:00:00.000Z",
      ),
    KnowledgeChunkError,
  );
});

test("requires chunk metadata needed for storage", () => {
  assert.throws(
    () =>
      knowledgeChunkFromDocument(
        {
          id: "bad",
          pageContent: "x",
          metadata: { sourceId: "dossier" },
        },
        Array.from({ length: GEMINI_EMBEDDING_DIMENSIONS }, () => 0),
        "2026-01-01T00:00:00.000Z",
      ),
    KnowledgeChunkError,
  );
});
