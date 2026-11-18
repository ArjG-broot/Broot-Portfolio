import assert from "node:assert/strict";
import test from "node:test";
import {
  capExpansionContext,
  compareDocumentOrder,
  deriveExpansionGroup,
  EXPANSION_MAX_CONTEXT_CHARS,
  mergeExpansionResults,
  selectExpansionGroups,
  sortRowsByDocumentIndex,
  type RetrievedKnowledgeChunk,
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

test("compareDocumentOrder sorts doc:10 after doc:2 numerically", () => {
  assert.ok(
    compareDocumentOrder(
      "portfolio_knowledge:doc:2:chunk:0",
      "portfolio_knowledge:doc:10:chunk:0",
    ) < 0,
  );

  const sorted = sortRowsByDocumentIndex([
    { document_id: "portfolio_knowledge:doc:10", id: "b" },
    { document_id: "portfolio_knowledge:doc:2", id: "a" },
  ]);

  assert.deepEqual(
    sorted.map((row) => row.id),
    ["a", "b"],
  );
});

test("deriveExpansionGroup maps project, experience and skills", () => {
  assert.deepEqual(
    deriveExpansionGroup({ projectName: "Broot-Chess", chunkType: "project" }),
    { kind: "project", projectName: "Broot-Chess" },
  );
  assert.deepEqual(deriveExpansionGroup({ projectName: null, chunkType: "experience" }), {
    kind: "chunk_type",
    chunkType: "experience",
  });
  assert.deepEqual(deriveExpansionGroup({ projectName: null, chunkType: "skills" }), {
    kind: "chunk_type",
    chunkType: "skills",
  });
  assert.equal(
    deriveExpansionGroup({ projectName: null, chunkType: "overview" }),
    null,
  );
});

test("selectExpansionGroups keeps at most two distinct high-similarity groups", () => {
  const vector: RetrievedKnowledgeChunk[] = [
    {
      id: "a",
      sourceId: "portfolio_knowledge",
      documentId: "portfolio_knowledge:doc:1",
      chunkIndex: 0,
      section: "Experience",
      sectionPath: null,
      chunkType: "experience",
      projectName: null,
      content: "nyx",
      embeddingModel: "gemini-embedding-001",
      similarity: 0.8,
    },
    {
      id: "b",
      sourceId: "portfolio_knowledge",
      documentId: "portfolio_knowledge:doc:2",
      chunkIndex: 0,
      section: "Project: Broot-Chess",
      sectionPath: null,
      chunkType: "project",
      projectName: "Broot-Chess",
      content: "chess",
      embeddingModel: "gemini-embedding-001",
      similarity: 0.75,
    },
    {
      id: "c",
      sourceId: "portfolio_knowledge",
      documentId: "portfolio_knowledge:doc:3",
      chunkIndex: 0,
      section: "Skills",
      sectionPath: null,
      chunkType: "skills",
      projectName: null,
      content: "skills",
      embeddingModel: "gemini-embedding-001",
      similarity: 0.7,
    },
  ];

  const groups = selectExpansionGroups(vector);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, "chunk_type");
  assert.equal(groups[1].kind, "project");
});

test("capExpansionContext drops non-group tail chunks before cutting groups", () => {
  const merged = mergeExpansionResults([], [
    {
      id: "g1",
      section: "G1",
      content: "x".repeat(8000),
      chunkType: "experience",
      projectName: null,
      similarity: null,
      expanded: true,
    },
    {
      id: "n1",
      section: "N1",
      content: "y".repeat(5000),
      chunkType: "overview",
      projectName: null,
      similarity: 0.5,
      expanded: false,
    },
  ]);

  const capped = capExpansionContext(merged, EXPANSION_MAX_CONTEXT_CHARS);
  assert.ok(capped.some((chunk) => chunk.id === "g1"));
  assert.equal(
    capped.filter((chunk) => !chunk.expanded).length,
    0,
  );
});
