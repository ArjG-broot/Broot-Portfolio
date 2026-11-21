import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildKnowledgeChunksFromMarkdown } from "../src/server/knowledge/build-ingest-chunks";
import { chunkDocuments } from "../src/server/knowledge/chunk-documents";
import { loadDocx } from "../src/server/knowledge/docx-loader";
import { embedTexts } from "../src/server/knowledge/gemini-embed";
import {
  buildKnowledgeChunkRows,
  embeddingInputForChunk,
  replaceKnowledgeChunksForSource,
} from "../src/server/knowledge/knowledge-chunks";
import { getSupabaseKnowledgeClient } from "../src/server/knowledge/supabase-client";

const DEFAULT_MARKDOWN =
  "C:/Users/BROOTBULL/codeAssets/portfolio_knowledge (1).md";

function resolveMarkdownSourceId(): string {
  return (
    process.env.PORTFOLIO_KNOWLEDGE_SOURCE_ID?.trim() ?? "portfolio_knowledge"
  );
}
const DEFAULT_DOCX =
  "C:/Users/BROOTBULL/codeAssets/Developer_and_Personal_Growth_Dossier.docx";

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function loadKnowledgeChunks(filePath: string) {
  const resolved = filePath.toLowerCase();

  if (resolved.endsWith(".md")) {
    const markdown = await readFile(path.resolve(filePath), "utf8");
    const sourceId = resolveMarkdownSourceId();
    return buildKnowledgeChunksFromMarkdown(markdown, sourceId);
  }

  if (resolved.endsWith(".docx")) {
    const documents = await loadDocx(filePath, { log: false });
    return chunkDocuments(documents);
  }

  throw new Error("Knowledge source must be a .md or .docx file.");
}

async function main() {
  loadEnvLocal();

  const persist = process.argv.includes("--persist");
  const fileArg = process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--"));
  const filePath =
    fileArg ??
    process.env.PORTFOLIO_KNOWLEDGE_MD ??
    process.env.PORTFOLIO_KNOWLEDGE_DOCX ??
    DEFAULT_MARKDOWN;

  const chunks = await loadKnowledgeChunks(filePath);
  const documentCount = new Set(
    chunks.map((chunk) => chunk.metadata.documentId).filter(Boolean),
  ).size;

  if (chunks.length === 0) {
    throw new Error("No chunks were produced from the knowledge source.");
  }

  const sourceId = chunks[0].metadata.sourceId;

  if (!persist) {
    console.log(
      JSON.stringify(
        {
          mode: "chunk-only",
          sourceFile: filePath,
          sourceId,
          documents: documentCount,
          chunks: chunks.length,
          hint: "Re-run with --persist to embed and write to Supabase.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const embeddings = await embedTexts(chunks.map(embeddingInputForChunk));
  const updatedAt = new Date().toISOString();
  const rows = buildKnowledgeChunkRows(chunks, embeddings, updatedAt);

  const supabase = getSupabaseKnowledgeClient();
  const result = await replaceKnowledgeChunksForSource(
    supabase,
    sourceId,
    rows,
  );

  console.log(
    JSON.stringify(
      {
        sourceId,
        documents: documentCount,
        chunks: chunks.length,
        upserted: result.upserted,
        deletedStale: result.deleted,
        embeddingModel: rows[0]?.embedding_model,
        embeddingDimensions: rows[0]?.embedding.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Ingestion failed.";
  console.error(`Knowledge ingestion failed: ${message}`);
  process.exit(1);
});
