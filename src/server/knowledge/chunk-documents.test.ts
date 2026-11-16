import assert from "node:assert/strict";
import test from "node:test";
import { chunkDocuments } from "./chunk-documents";
import type { KnowledgeDocument } from "./document";

function doc(
  id: string,
  pageContent: string,
  section?: string,
): KnowledgeDocument {
  return {
    id,
    pageContent,
    metadata: {
      sourceId: "dossier",
      ...(section ? { section } : {}),
    },
  };
}

test("keeps a short document as one chunk", () => {
  const chunks = chunkDocuments([doc("dossier:1", "Short answer.")], {
    maxChunkSize: 200,
    chunkOverlap: 20,
  });

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].pageContent, "Short answer.");
  assert.equal(chunks[0].id, "dossier:1:chunk:0");
  assert.equal(chunks[0].metadata.chunkIndex, 0);
  assert.equal(chunks[0].metadata.documentId, "dossier:1");
  assert.equal(chunks[0].metadata.section, undefined);
});

test("splits a long document into multiple chunks", () => {
  const paragraphA = "Alpha ".repeat(80).trim();
  const paragraphB = "Beta ".repeat(80).trim();
  const chunks = chunkDocuments(
    [doc("dossier:2", `${paragraphA}\n\n${paragraphB}`, "Projects")],
    { maxChunkSize: 220, chunkOverlap: 30 },
  );

  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.pageContent.length <= 220));
});

test("overlaps consecutive chunks", () => {
  const paragraphA = "First sentence here. ".repeat(12).trim();
  const paragraphB = "Second sentence there. ".repeat(12).trim();
  const chunks = chunkDocuments(
    [doc("dossier:3", `${paragraphA}\n\n${paragraphB}`)],
    { maxChunkSize: 180, chunkOverlap: 40 },
  );

  assert.ok(chunks.length >= 2);
  const firstTail = chunks[0].pageContent.slice(-40);
  assert.ok(chunks[1].pageContent.includes(firstTail.trim().slice(-20)));
});

test("preserves metadata and unique chunk ids across documents", () => {
  const chunks = chunkDocuments(
    [
      doc("dossier:4", "One", "Projects"),
      doc("dossier:5", "Two", "Projects"),
    ],
    { maxChunkSize: 500, chunkOverlap: 0 },
  );

  assert.deepEqual(
    chunks.map((chunk) => chunk.id),
    ["dossier:4:chunk:0", "dossier:5:chunk:0"],
  );
  assert.equal(chunks[0].metadata.sourceId, "dossier");
  assert.equal(chunks[0].metadata.section, "Projects");
  assert.equal(chunks[1].metadata.documentId, "dossier:5");
});

test("returns no chunks for empty content", () => {
  assert.deepEqual(chunkDocuments([doc("dossier:6", "   \n")]), []);
});

test("keeps heading context on each chunk", () => {
  const body = `${"Detail line.\n\n".repeat(40)}Final point.`;
  const chunks = chunkDocuments(
    [doc("dossier:7", `# Projects\n${body}`, "Projects")],
    { maxChunkSize: 200, chunkOverlap: 25 },
  );

  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.pageContent.startsWith("# Projects")));
  assert.equal(chunks[0].metadata.section, "Projects");
});

test("is deterministic for the same input", () => {
  const input = [doc("dossier:8", "Para one.\n\nPara two with more text. ".repeat(20))];
  const options = { maxChunkSize: 160, chunkOverlap: 20 };
  const first = chunkDocuments(input, options);
  const second = chunkDocuments(input, options);

  assert.deepEqual(
    first.map((chunk) => ({ id: chunk.id, pageContent: chunk.pageContent })),
    second.map((chunk) => ({ id: chunk.id, pageContent: chunk.pageContent })),
  );
});
