import { embedTexts, EmbeddingError } from "./gemini-embed";
import {
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_SIMILARITY_THRESHOLD,
  type KnowledgeChunkType,
} from "./ingestion-config";
import { getSupabaseKnowledgeClient } from "./supabase-client";

export { DEFAULT_RETRIEVAL_LIMIT, DEFAULT_SIMILARITY_THRESHOLD };
export const MAX_RETRIEVAL_LIMIT = 20;
export const MAX_RETRIEVAL_QUESTION_LENGTH = 2000;

export class KnowledgeRetrievalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeRetrievalError";
  }
}

export type RetrievedKnowledgeChunk = {
  id: string;
  sourceId: string;
  documentId: string;
  chunkIndex: number;
  section: string | null;
  sectionPath: string | null;
  chunkType: KnowledgeChunkType | null;
  projectName: string | null;
  content: string;
  embeddingModel: string;
  similarity: number;
};

export type RetrieveKnowledgeOptions = {
  limit?: number;
  sourceId?: string;
  chunkType?: KnowledgeChunkType;
  similarityThreshold?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateRetrievalQuestion(question: string): string {
  const trimmed = question.trim();

  if (trimmed.length === 0) {
    throw new KnowledgeRetrievalError("Question must not be empty.");
  }

  if (trimmed.length > MAX_RETRIEVAL_QUESTION_LENGTH) {
    throw new KnowledgeRetrievalError(
      `Question must be at most ${MAX_RETRIEVAL_QUESTION_LENGTH} characters.`,
    );
  }

  return trimmed;
}

export function resolveRetrievalLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_RETRIEVAL_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RETRIEVAL_LIMIT) {
    throw new KnowledgeRetrievalError(
      `Limit must be an integer between 1 and ${MAX_RETRIEVAL_LIMIT}.`,
    );
  }

  return limit;
}

export function mapMatchKnowledgeChunkRow(
  row: Record<string, unknown>,
): RetrievedKnowledgeChunk {
  const similarity = row.similarity;

  if (
    typeof row.id !== "string" ||
    typeof row.source_id !== "string" ||
    typeof row.document_id !== "string" ||
    typeof row.chunk_index !== "number" ||
    typeof row.content !== "string" ||
    typeof row.embedding_model !== "string" ||
    typeof similarity !== "number" ||
    !Number.isFinite(similarity)
  ) {
    throw new KnowledgeRetrievalError("Retrieval row has an unexpected shape.");
  }

  return {
    id: row.id,
    sourceId: row.source_id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    section: typeof row.section === "string" ? row.section : null,
    sectionPath: typeof row.section_path === "string" ? row.section_path : null,
    chunkType:
      typeof row.chunk_type === "string"
        ? (row.chunk_type as KnowledgeChunkType)
        : null,
    projectName: typeof row.project_name === "string" ? row.project_name : null,
    content: row.content,
    embeddingModel: row.embedding_model,
    similarity,
  };
}

export function mapMatchKnowledgeChunkRows(
  rows: unknown,
): RetrievedKnowledgeChunk[] {
  if (!Array.isArray(rows)) {
    throw new KnowledgeRetrievalError("Retrieval response is not an array.");
  }

  return rows.map((row) => {
    if (!isRecord(row)) {
      throw new KnowledgeRetrievalError("Retrieval row is not an object.");
    }

    return mapMatchKnowledgeChunkRow(row);
  });
}

export async function retrieveKnowledgeChunks(
  question: string,
  options: RetrieveKnowledgeOptions = {},
): Promise<RetrievedKnowledgeChunk[]> {
  if (typeof window !== "undefined") {
    throw new KnowledgeRetrievalError(
      "Knowledge retrieval can only run on the server.",
    );
  }

  const trimmedQuestion = validateRetrievalQuestion(question);
  const limit = resolveRetrievalLimit(options.limit);
  const sourceId = options.sourceId?.trim() || null;
  const chunkType = options.chunkType ?? null;
  const similarityThreshold =
    options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  let queryEmbedding: number[];

  try {
    [queryEmbedding] = await embedTexts([trimmedQuestion]);
  } catch (error) {
    if (error instanceof EmbeddingError) {
      throw new KnowledgeRetrievalError(error.message);
    }

    throw error;
  }

  if (!queryEmbedding) {
    throw new KnowledgeRetrievalError("Failed to generate a query embedding.");
  }

  const supabase = getSupabaseKnowledgeClient();
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_count: limit,
    filter_source_id: sourceId,
    filter_chunk_type: chunkType,
    match_threshold: similarityThreshold,
  });

  if (error) {
    throw new KnowledgeRetrievalError(
      `Knowledge retrieval failed: ${error.code ?? "unknown"} — ${error.message}`,
    );
  }

  return mapMatchKnowledgeChunkRows(data);
}
