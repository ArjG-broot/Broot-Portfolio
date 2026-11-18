import type { SupabaseClient } from "@supabase/supabase-js";
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

export const EXPANSION_GROUP_MIN_SIMILARITY = 0.6;
export const EXPANSION_MAX_DISTINCT_GROUPS = 2;
export const EXPANSION_MAX_CONTEXT_CHARS = 12_000;
export const DEFAULT_EXPANSION_SOURCE_ID = "portfolio_knowledge";

export type ExpandedKnowledgeChunk = {
  id: string;
  section: string | null;
  content: string;
  chunkType: KnowledgeChunkType | null;
  projectName: string | null;
  similarity: number | null;
  expanded: boolean;
};

export type ExpansionGroup =
  | { kind: "project"; projectName: string }
  | { kind: "chunk_type"; chunkType: "experience" | "skills" };

type GroupedChunkRow = {
  id: string;
  document_id: string;
  section: string | null;
  chunk_type: string | null;
  project_name: string | null;
  content: string;
};

const DOCUMENT_INDEX = /:doc:(\d+)(?::|$)/;

export function parseDocumentIndex(documentId: string): number {
  const match = DOCUMENT_INDEX.exec(documentId);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(match[1], 10);
}

export function compareDocumentOrder(
  leftDocumentId: string,
  rightDocumentId: string,
): number {
  return parseDocumentIndex(leftDocumentId) - parseDocumentIndex(rightDocumentId);
}

export function sortRowsByDocumentIndex<T extends { document_id: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) =>
    compareDocumentOrder(left.document_id, right.document_id),
  );
}

export function deriveExpansionGroup(
  chunk: Pick<
    RetrievedKnowledgeChunk,
  "projectName" | "chunkType"
  >,
): ExpansionGroup | null {
  if (chunk.projectName) {
    return { kind: "project", projectName: chunk.projectName };
  }

  if (chunk.chunkType === "experience") {
    return { kind: "chunk_type", chunkType: "experience" };
  }

  if (chunk.chunkType === "skills") {
    return { kind: "chunk_type", chunkType: "skills" };
  }

  return null;
}

export function expansionGroupKey(group: ExpansionGroup): string {
  if (group.kind === "project") {
    return `project:${group.projectName}`;
  }

  return `chunk_type:${group.chunkType}`;
}

export function selectExpansionGroups(
  vectorResults: RetrievedKnowledgeChunk[],
  minSimilarity = EXPANSION_GROUP_MIN_SIMILARITY,
  maxGroups = EXPANSION_MAX_DISTINCT_GROUPS,
): ExpansionGroup[] {
  const groups: ExpansionGroup[] = [];
  const seen = new Set<string>();

  for (const result of vectorResults) {
    if (result.similarity < minSimilarity) continue;

    const group = deriveExpansionGroup(result);
    if (!group) continue;

    const key = expansionGroupKey(group);
    if (seen.has(key)) continue;

    seen.add(key);
    groups.push(group);

    if (groups.length >= maxGroups) break;
  }

  return groups;
}

export function rowToExpandedChunk(
  row: GroupedChunkRow,
  options: { expanded: boolean; similarity: number | null },
): ExpandedKnowledgeChunk {
  return {
    id: row.id,
    section: row.section,
    content: row.content,
    chunkType:
      typeof row.chunk_type === "string"
        ? (row.chunk_type as KnowledgeChunkType)
        : null,
    projectName: row.project_name,
    similarity: options.similarity,
    expanded: options.expanded,
  };
}

export function vectorResultToExpanded(
  chunk: RetrievedKnowledgeChunk,
): ExpandedKnowledgeChunk {
  return {
    id: chunk.id,
    section: chunk.section,
    content: chunk.content,
    chunkType: chunk.chunkType,
    projectName: chunk.projectName,
    similarity: chunk.similarity,
    expanded: false,
  };
}

export function mergeExpansionResults(
  vectorResults: RetrievedKnowledgeChunk[],
  groupChunks: ExpandedKnowledgeChunk[],
): ExpandedKnowledgeChunk[] {
  const seen = new Set<string>();
  const merged: ExpandedKnowledgeChunk[] = [];

  for (const chunk of groupChunks) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    merged.push(chunk);
  }

  for (const chunk of vectorResults) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    merged.push(vectorResultToExpanded(chunk));
  }

  return merged;
}

export function formatChunkContextLength(chunk: ExpandedKnowledgeChunk): number {
  const section = chunk.section ?? "Untitled";
  return `[${section}]\n${chunk.content}`.length + 2;
}

export function capExpansionContext(
  chunks: ExpandedKnowledgeChunk[],
  maxChars = EXPANSION_MAX_CONTEXT_CHARS,
): ExpandedKnowledgeChunk[] {
  const groupChunks = chunks.filter((chunk) => chunk.expanded);
  const nonGroupChunks = chunks.filter((chunk) => !chunk.expanded);

  let total =
    groupChunks.reduce((sum, chunk) => sum + formatChunkContextLength(chunk), 0) +
    nonGroupChunks.reduce((sum, chunk) => sum + formatChunkContextLength(chunk), 0);

  if (total <= maxChars) {
    return chunks;
  }

  const keptNonGroup = [...nonGroupChunks];
  while (keptNonGroup.length > 0 && total > maxChars) {
    const removed = keptNonGroup.pop();
    if (!removed) break;
    total -= formatChunkContextLength(removed);
  }

  return [...groupChunks, ...keptNonGroup];
}

export async function fetchChunksByGroup(
  supabase: SupabaseClient,
  sourceId: string,
  group: ExpansionGroup,
): Promise<ExpandedKnowledgeChunk[]> {
  let query = supabase
    .from("knowledge_chunks")
    .select(
      "id, document_id, section, chunk_type, project_name, content",
    )
    .eq("source_id", sourceId);

  if (group.kind === "project") {
    query = query.eq("project_name", group.projectName);
  } else {
    query = query.eq("chunk_type", group.chunkType);
  }

  const { data, error } = await query;

  if (error) {
    throw new KnowledgeRetrievalError(
      `Group fetch failed: ${error.code ?? "unknown"} — ${error.message}`,
    );
  }

  const rows = sortRowsByDocumentIndex((data ?? []) as GroupedChunkRow[]);

  return rows.map((row) =>
    rowToExpandedChunk(row, { expanded: true, similarity: null }),
  );
}

export async function retrieveWithExpansion(
  question: string,
  options: RetrieveKnowledgeOptions = {},
): Promise<ExpandedKnowledgeChunk[]> {
  const sourceId = options.sourceId?.trim() || DEFAULT_EXPANSION_SOURCE_ID;

  const vectorResults = await retrieveKnowledgeChunks(question, {
    ...options,
    sourceId,
  });

  if (vectorResults.length === 0) {
    return [];
  }

  if (!deriveExpansionGroup(vectorResults[0])) {
    return vectorResults.map(vectorResultToExpanded);
  }

  const groups = selectExpansionGroups(vectorResults);
  if (groups.length === 0) {
    return vectorResults.map(vectorResultToExpanded);
  }

  const supabase = getSupabaseKnowledgeClient();
  const expandedGroupChunks: ExpandedKnowledgeChunk[] = [];

  for (const group of groups) {
    const rows = await fetchChunksByGroup(supabase, sourceId, group);
    expandedGroupChunks.push(...rows);
  }

  const merged = mergeExpansionResults(vectorResults, expandedGroupChunks);
  return capExpansionContext(merged);
}

export function totalExpandedContextLength(
  chunks: ExpandedKnowledgeChunk[],
): number {
  if (chunks.length === 0) return 0;

  return chunks
    .map((chunk) => {
      const section = chunk.section ?? "Untitled";
      return `[${section}]\n${chunk.content}`;
    })
    .join("\n\n").length;
}
