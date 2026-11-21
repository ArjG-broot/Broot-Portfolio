import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeDocument } from "./document";
import type { KnowledgeChunkType } from "./ingestion-config";
import { GEMINI_EMBEDDING_MODEL } from "./gemini-embed";

export type KnowledgeChunkRow = {
  id: string;
  source_id: string;
  document_id: string;
  chunk_index: number;
  section: string | null;
  section_path: string | null;
  chunk_type: KnowledgeChunkType | null;
  project_name: string | null;
  content: string;
  embedding: number[];
  embedding_model: string;
  updated_at: string;
};

export class KnowledgeChunkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeChunkError";
  }
}

export function knowledgeChunkFromDocument(
  chunk: KnowledgeDocument,
  embedding: number[],
  updatedAt: string,
  embeddingModel = GEMINI_EMBEDDING_MODEL,
): KnowledgeChunkRow {
  const documentId = chunk.metadata.documentId;
  const chunkIndex = chunk.metadata.chunkIndex;

  if (!documentId) {
    throw new KnowledgeChunkError(
      `Chunk ${chunk.id} is missing metadata.documentId.`,
    );
  }

  if (chunkIndex === undefined) {
    throw new KnowledgeChunkError(
      `Chunk ${chunk.id} is missing metadata.chunkIndex.`,
    );
  }

  return {
    id: chunk.id,
    source_id: chunk.metadata.sourceId,
    document_id: documentId,
    chunk_index: chunkIndex,
    section: chunk.metadata.section ?? null,
    section_path: chunk.metadata.sectionPath ?? null,
    chunk_type: chunk.metadata.chunkType ?? null,
    project_name: chunk.metadata.projectName ?? null,
    content: chunk.pageContent,
    embedding,
    embedding_model: embeddingModel,
    updated_at: updatedAt,
  };
}

export function embeddingInputForChunk(chunk: KnowledgeDocument): string {
  const text = chunk.metadata.embeddingText?.trim();
  if (text && text.length > 0) return text;
  return chunk.pageContent;
}

export function buildKnowledgeChunkRows(
  chunks: KnowledgeDocument[],
  embeddings: number[][],
  updatedAt: string,
): KnowledgeChunkRow[] {
  if (chunks.length !== embeddings.length) {
    throw new KnowledgeChunkError(
      "Chunk count does not match embedding count.",
    );
  }

  return chunks.map((chunk, index) =>
    knowledgeChunkFromDocument(chunk, embeddings[index], updatedAt),
  );
}

const UPSERT_BATCH_SIZE = 50;

export async function upsertKnowledgeChunks(
  supabase: SupabaseClient,
  rows: KnowledgeChunkRow[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    const { error } = await supabase.from("knowledge_chunks").upsert(batch, {
      onConflict: "id",
    });

    if (error) {
      throw new KnowledgeChunkError(
        `Failed to upsert knowledge chunks: ${error.code ?? "unknown"} — ${error.message}`,
      );
    }
  }
}

export async function deleteStaleKnowledgeChunks(
  supabase: SupabaseClient,
  sourceId: string,
  keepIds: string[],
): Promise<number> {
  const keep = new Set(keepIds);

  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("id")
    .eq("source_id", sourceId);

  if (error) {
    throw new KnowledgeChunkError(
      `Failed to list existing chunks: ${error.code ?? "unknown"} — ${error.message}`,
    );
  }

  const staleIds =
    data?.map((row) => row.id).filter((id) => !keep.has(id)) ?? [];

  if (staleIds.length === 0) return 0;

  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .in("id", staleIds);

  if (deleteError) {
    throw new KnowledgeChunkError(
      `Failed to delete stale chunks: ${deleteError.code ?? "unknown"} — ${deleteError.message}`,
    );
  }

  return staleIds.length;
}

export async function replaceKnowledgeChunksForSource(
  supabase: SupabaseClient,
  sourceId: string,
  rows: KnowledgeChunkRow[],
): Promise<{ upserted: number; deleted: number }> {
  if (rows.length === 0) {
    throw new KnowledgeChunkError("No knowledge chunks to store.");
  }

  const mismatched = rows.find((row) => row.source_id !== sourceId);
  if (mismatched) {
    throw new KnowledgeChunkError(
      `Chunk ${mismatched.id} does not belong to source ${sourceId}.`,
    );
  }

  await upsertKnowledgeChunks(supabase, rows);
  const deleted = await deleteStaleKnowledgeChunks(
    supabase,
    sourceId,
    rows.map((row) => row.id),
  );

  return { upserted: rows.length, deleted };
}
