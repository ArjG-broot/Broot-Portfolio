import type { KnowledgeChunkType } from "./ingestion-config";

export type KnowledgeDocument = {
  id: string;
  pageContent: string;
  metadata: {
    sourceId: string;
    title?: string;
    section?: string;
    sectionPath?: string;
    chunkType?: KnowledgeChunkType;
    projectName?: string | null;
    /** Text sent to the embedding model (path prefix + body). */
    embeddingText?: string;
    documentId?: string;
    chunkIndex?: number;
  };
};
