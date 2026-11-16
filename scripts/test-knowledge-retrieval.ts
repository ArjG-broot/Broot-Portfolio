import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { KnowledgeChunkType } from "../src/server/knowledge/ingestion-config";
import { retrieveKnowledgeChunks } from "../src/server/knowledge/knowledge-retrieval";

/** Collapse line breaks so wrapped source lines do not glue words in previews. */
function formatRetrievalPreview(content: string, maxLength = 200): string {
  const flattened = content
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (flattened.length <= maxLength) {
    return flattened;
  }

  return `${flattened.slice(0, maxLength)}…`;
}

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

async function main() {
  loadEnvLocal();

  const question = process.argv.slice(2).join(" ").trim();
  const sourceId = process.env.PORTFOLIO_KNOWLEDGE_SOURCE_ID?.trim();
  const chunkType = process.env.PORTFOLIO_KNOWLEDGE_CHUNK_TYPE?.trim() as
    | KnowledgeChunkType
    | undefined;

  if (!question) {
    console.error("Pass a question, for example:");
    console.error(
      '  npx tsx scripts/test-knowledge-retrieval.ts "What projects has Arjit built?"',
    );
    process.exit(1);
  }

  const results = await retrieveKnowledgeChunks(question, {
    ...(sourceId ? { sourceId } : {}),
    ...(chunkType ? { chunkType } : {}),
  });

  for (const [index, chunk] of results.entries()) {
    const preview = formatRetrievalPreview(chunk.content);

    console.log(
      JSON.stringify(
        {
          rank: index + 1,
          type: chunk.chunkType,
          projectName: chunk.projectName,
          section: chunk.section,
          similarity: Number(chunk.similarity.toFixed(4)),
          preview,
        },
        null,
        2,
      ),
    );
  }

  if (results.length === 0) {
    console.log("No matching chunks were returned.");
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Knowledge retrieval failed.";
  console.error(`Knowledge retrieval test failed: ${message}`);
  process.exit(1);
});
