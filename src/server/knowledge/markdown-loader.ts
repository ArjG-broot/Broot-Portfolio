import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { KnowledgeDocument } from "./document";
import { KnowledgeLoadError } from "./docx-loader";
import { logIngestedDocuments } from "./format-ingested";
import { buildIngestSectionDocuments } from "./build-ingest-chunks";

export type LoadMarkdownOptions = {
  log?: boolean;
};

export async function loadMarkdown(
  filePath: string,
  options: LoadMarkdownOptions = {},
): Promise<KnowledgeDocument[]> {
  if (typeof window !== "undefined") {
    throw new KnowledgeLoadError(
      "The Markdown loader can only run on the server.",
    );
  }

  const resolved = path.resolve(filePath);

  try {
    await access(resolved);
  } catch {
    throw new KnowledgeLoadError("Markdown file was not found.");
  }

  let markdown: string;

  try {
    markdown = await readFile(resolved, "utf8");
  } catch {
    throw new KnowledgeLoadError("Markdown file could not be read.");
  }

  if (markdown.trim().length === 0) {
    throw new KnowledgeLoadError("Markdown file is empty.");
  }

  const sourceId = path.basename(resolved, path.extname(resolved));
  const documents = buildIngestSectionDocuments(markdown, sourceId);

  if (documents.length === 0) {
    throw new KnowledgeLoadError("Markdown produced no documents.");
  }

  if (options.log !== false) {
    logIngestedDocuments(documents);
  }

  return documents;
}
