import type { KnowledgeDocument } from "./document";

export function formatIngestedDocuments(documents: KnowledgeDocument[]): string {
  return documents
    .map((document) => {
      const section = document.metadata.section ?? "(preamble)";
      const title = document.metadata.title ?? "(none)";

      return [
        `--- ${document.id} ---`,
        `sourceId: ${document.metadata.sourceId}`,
        `section: ${section}`,
        `title: ${title}`,
        "",
        document.pageContent,
      ].join("\n");
    })
    .join("\n\n");
}

export function logIngestedDocuments(documents: KnowledgeDocument[]): void {
  const sourceId = documents[0]?.metadata.sourceId ?? "unknown";
  console.info(
    `[knowledge/ingest] ${documents.length} document(s) from ${sourceId}\n\n${formatIngestedDocuments(documents)}`,
  );
}
