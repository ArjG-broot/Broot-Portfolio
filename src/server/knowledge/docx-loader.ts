import { access } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import type { KnowledgeDocument } from "./document";
import { documentsFromMarkdown } from "./markdown-sections";
import { logIngestedDocuments } from "./format-ingested";

export class KnowledgeLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeLoadError";
  }
}

export type LoadDocxOptions = {
  log?: boolean;
};

export async function loadDocx(
  filePath: string,
  options: LoadDocxOptions = {},
): Promise<KnowledgeDocument[]> {
  if (typeof window !== "undefined") {
    throw new KnowledgeLoadError("The DOCX loader can only run on the server.");
  }

  const resolved = path.resolve(filePath);

  try {
    await access(resolved);
  } catch {
    throw new KnowledgeLoadError("DOCX file was not found.");
  }

  let extracted: Awaited<ReturnType<typeof mammoth.convertToMarkdown>>;

  try {
    extracted = await mammoth.convertToMarkdown({ path: resolved });
  } catch {
    throw new KnowledgeLoadError("DOCX text could not be extracted.");
  }

  const extractionError = extracted.messages.find(
    (message) => message.type === "error",
  );
  if (extractionError) {
    throw new KnowledgeLoadError("DOCX text could not be extracted.");
  }

  const sourceId = path.basename(resolved, path.extname(resolved));
  const documents = documentsFromMarkdown(extracted.value, sourceId);

  if (documents.length === 0) {
    throw new KnowledgeLoadError("DOCX extraction produced no text.");
  }

  if (options.log !== false) {
    logIngestedDocuments(documents);
  }

  return documents;
}
