import assert from "node:assert/strict";
import test from "node:test";
import {
  KnowledgeRetrievalError,
  mapMatchKnowledgeChunkRow,
  mapMatchKnowledgeChunkRows,
  resolveRetrievalLimit,
  validateRetrievalQuestion,
} from "./knowledge-retrieval";

test("validateRetrievalQuestion trims and rejects empty input", () => {
  assert.equal(validateRetrievalQuestion("  hello  "), "hello");
  assert.throws(() => validateRetrievalQuestion("   "), KnowledgeRetrievalError);
});

test("resolveRetrievalLimit uses default and bounds", () => {
  assert.equal(resolveRetrievalLimit(), 6);
  assert.equal(resolveRetrievalLimit(3), 3);
  assert.throws(() => resolveRetrievalLimit(0), KnowledgeRetrievalError);
  assert.throws(() => resolveRetrievalLimit(100), KnowledgeRetrievalError);
});

test("mapMatchKnowledgeChunkRow maps database fields", () => {
  const mapped = mapMatchKnowledgeChunkRow({
    id: "dossier:1:chunk:0",
    source_id: "Developer_and_Personal_Growth_Dossier",
    document_id: "dossier:1",
    chunk_index: 0,
    section: "Projects",
    section_path: "Arjit Gupta portfolio > 3. Projects",
    chunk_type: "project",
    project_name: "Broot-Portfolio",
    content: "Chunk text",
    embedding_model: "gemini-embedding-001",
    similarity: 0.87,
  });

  assert.equal(mapped.id, "dossier:1:chunk:0");
  assert.equal(mapped.sourceId, "Developer_and_Personal_Growth_Dossier");
  assert.equal(mapped.section, "Projects");
  assert.equal(mapped.chunkType, "project");
  assert.equal(mapped.projectName, "Broot-Portfolio");
  assert.equal(mapped.similarity, 0.87);
});

test("mapMatchKnowledgeChunkRows rejects malformed payloads", () => {
  assert.throws(() => mapMatchKnowledgeChunkRows(null), KnowledgeRetrievalError);
  assert.throws(
    () => mapMatchKnowledgeChunkRows([{ id: "only-id" }]),
    KnowledgeRetrievalError,
  );
});
