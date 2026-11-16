import type { KnowledgeDocument } from "./document";

/** ~300 tokens of prose: enough project detail without bloating retrieval context. */
export const DEFAULT_MAX_CHUNK_SIZE = 1200;

/** ~1–2 sentences so facts split across chunk boundaries still appear in both neighbors. */
export const DEFAULT_CHUNK_OVERLAP = 150;

export type ChunkDocumentsOptions = {
  maxChunkSize?: number;
  chunkOverlap?: number;
};

const HEADING_LINE = /^(#{1,6})[ \t]+.+$/;
const PARAGRAPH_BREAK = /\n{2,}/;
const SENTENCE_BREAK = /(?<=[.!?])\s+/;

export function chunkDocuments(
  documents: KnowledgeDocument[],
  options: ChunkDocumentsOptions = {},
): KnowledgeDocument[] {
  const maxChunkSize = options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  return documents.flatMap((document) =>
    chunkDocument(document, maxChunkSize, chunkOverlap),
  );
}

function chunkDocument(
  document: KnowledgeDocument,
  maxChunkSize: number,
  chunkOverlap: number,
): KnowledgeDocument[] {
  const trimmed = document.pageContent.trim();
  if (trimmed.length === 0) return [];

  if (trimmed.length <= maxChunkSize) {
    return [toChunk(document, trimmed, 0)];
  }

  const { headingLine, body } = splitHeading(trimmed);
  const prefixBlock = headingLine ? `${headingLine}\n\n` : "";
  const maxBodySize = Math.max(1, maxChunkSize - prefixBlock.length);
  const bodyChunks = chunkBody(body, maxBodySize, chunkOverlap);

  const pageContents = bodyChunks.map((chunk) =>
    headingLine ? `${headingLine}\n\n${chunk}` : chunk,
  );

  return pageContents.map((pageContent, chunkIndex) =>
    toChunk(document, pageContent, chunkIndex),
  );
}

function toChunk(
  document: KnowledgeDocument,
  pageContent: string,
  chunkIndex: number,
): KnowledgeDocument {
  return {
    id: `${document.id}:chunk:${chunkIndex}`,
    pageContent,
    metadata: {
      ...document.metadata,
      documentId: document.id,
      chunkIndex,
    },
  };
}

function splitHeading(content: string): {
  headingLine: string | null;
  body: string;
} {
  const newline = content.indexOf("\n");
  const firstLine = newline === -1 ? content : content.slice(0, newline);
  const rest = newline === -1 ? "" : content.slice(newline + 1).trim();

  if (!HEADING_LINE.test(firstLine)) {
    return { headingLine: null, body: content };
  }

  return { headingLine: firstLine, body: rest };
}

function chunkBody(
  body: string,
  maxBodySize: number,
  chunkOverlap: number,
): string[] {
  const trimmed = body.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxBodySize) return [trimmed];

  const units = toUnits(trimmed, maxBodySize);
  const chunks: string[] = [];
  let current: string[] = [];

  const currentText = () => current.join("\n\n");

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(currentText());
    current = [];
  };

  const beginWithOverlap = () => {
    if (chunks.length === 0 || chunkOverlap <= 0) return;
    const overlap = overlapTail(chunks[chunks.length - 1], chunkOverlap);
    if (overlap.length > 0) current = [overlap];
  };

  for (const unit of units) {
    if (unit.length > maxBodySize) {
      flush();
      for (let offset = 0; offset < unit.length; offset += maxBodySize) {
        chunks.push(unit.slice(offset, offset + maxBodySize));
      }
      beginWithOverlap();
      continue;
    }

    const candidate =
      current.length === 0 ? unit : `${currentText()}\n\n${unit}`;

    if (candidate.length > maxBodySize) {
      flush();
      beginWithOverlap();
      const withOverlap =
        current.length === 0 ? unit : `${currentText()}\n\n${unit}`;
      if (withOverlap.length <= maxBodySize) {
        current.push(unit);
      } else {
        current = [unit];
      }
      continue;
    }

    current.push(unit);
  }

  flush();
  return chunks;
}

function toUnits(text: string, maxBodySize: number): string[] {
  const paragraphs = text.split(PARAGRAPH_BREAK).map((part) => part.trim());
  const units: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) continue;

    if (paragraph.length <= maxBodySize) {
      units.push(paragraph);
      continue;
    }

    const sentences = paragraph
      .split(SENTENCE_BREAK)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    let buffer = "";

    for (const sentence of sentences) {
      const candidate = buffer ? `${buffer} ${sentence}` : sentence;

      if (candidate.length <= maxBodySize) {
        buffer = candidate;
        continue;
      }

      if (buffer.length > 0) {
        units.push(buffer);
        buffer = "";
      }

      if (sentence.length <= maxBodySize) {
        buffer = sentence;
      } else {
        units.push(sentence);
      }
    }

    if (buffer.length > 0) units.push(buffer);
  }

  return units;
}

function overlapTail(text: string, maxOverlap: number): string {
  if (text.length <= maxOverlap) return text;

  const slice = text.slice(-maxOverlap);
  const paragraphBreak = slice.indexOf("\n\n");
  if (paragraphBreak >= 0) {
    return slice.slice(paragraphBreak + 2).trimStart();
  }

  const sentenceBoundary = slice.search(/(?<=\. |\? |! )/);
  if (sentenceBoundary >= 0) {
    return slice.slice(sentenceBoundary + 1).trimStart();
  }

  return slice.trimStart();
}
