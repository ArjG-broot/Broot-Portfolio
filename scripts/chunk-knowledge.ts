import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildKnowledgeChunksFromMarkdown } from "../src/server/knowledge/build-ingest-chunks";
import { embeddingInputForChunk } from "../src/server/knowledge/knowledge-chunks";
import {
  isHeadingOnlySection,
  substantiveBodyLength,
} from "../src/server/knowledge/markdown-preprocess";

const DEFAULT_MARKDOWN =
  "C:/Users/BROOTBULL/codeAssets/portfolio_knowledge (1).md";
const DEFAULT_DEBUG_EMBED_LABEL = "Broot-Todo";

function debugEmbedLabelFromArgv(argv: string[]): string {
  const explicit = argv.find((arg) => arg.startsWith("--debug-embed="));
  if (explicit) {
    return explicit.slice("--debug-embed=".length).trim() || DEFAULT_DEBUG_EMBED_LABEL;
  }

  return DEFAULT_DEBUG_EMBED_LABEL;
}

async function main() {
  const argv = process.argv.slice(2);
  const debugEmbed = argv.includes("--debug-embed");
  const filePath =
    argv.find((arg) => !arg.startsWith("--")) ??
    process.env.PORTFOLIO_KNOWLEDGE_MD ??
    DEFAULT_MARKDOWN;
  const markdown = await readFile(path.resolve(filePath), "utf8");
  const sourceId =
    process.env.PORTFOLIO_KNOWLEDGE_SOURCE_ID?.trim() ?? "portfolio_knowledge";
  const chunks = buildKnowledgeChunksFromMarkdown(markdown, sourceId);

  if (chunks.length === 0) {
    throw new Error("No chunks were produced from the knowledge source.");
  }

  const headingOnly = chunks.filter((chunk) =>
    isHeadingOnlySection(chunk.pageContent),
  );
  const tooSmall = chunks.filter(
    (chunk) => substantiveBodyLength(chunk.pageContent) < 150,
  );

  const output: Record<string, unknown> = {
    sourceFile: filePath,
    sourceId: chunks[0].metadata.sourceId,
    sections: new Set(chunks.map((chunk) => chunk.metadata.documentId)).size,
    chunks: chunks.length,
    headingOnlyChunks: headingOnly.length,
    underMinBodyChars: tooSmall.length,
    chunkSummaries: chunks.map((chunk) => ({
      id: chunk.id,
      type: chunk.metadata.chunkType ?? null,
      projectName: chunk.metadata.projectName ?? null,
      section: chunk.metadata.section ?? null,
      chars: chunk.pageContent.length,
    })),
  };

  if (debugEmbed) {
    const label = debugEmbedLabelFromArgv(argv);
    const labelLower = label.toLowerCase();
    const match =
      chunks.find(
        (chunk) =>
          chunk.metadata.projectName?.toLowerCase() === labelLower ||
          chunk.metadata.section?.toLowerCase().includes(labelLower),
      ) ??
      chunks.find((chunk) => chunk.id.toLowerCase().includes(labelLower));

    if (!match) {
      output.debugEmbeddingInput = {
        error: `No chunk matched label "${label}".`,
        hint: "Use --debug-embed=Broot-Todo or match by projectName/section.",
      };
    } else {
      const embeddingText = embeddingInputForChunk(match);
      output.debugEmbeddingInput = {
        label,
        id: match.id,
        section: match.metadata.section ?? null,
        projectName: match.metadata.projectName ?? null,
        embeddingCharLength: embeddingText.length,
        embeddingText,
      };
    }
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Chunking failed.";
  console.error(`Knowledge chunking failed: ${message}`);
  process.exit(1);
});
