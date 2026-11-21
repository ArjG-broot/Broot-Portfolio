import { loadDocx } from "../src/server/knowledge/docx-loader";

async function main() {
  const filePath = process.argv[2] ?? process.env.PORTFOLIO_KNOWLEDGE_DOCX;

  if (!filePath) {
    console.error("Pass a DOCX path or set PORTFOLIO_KNOWLEDGE_DOCX.");
    process.exit(1);
  }

  const documents = await loadDocx(filePath);
  const ids = new Set(documents.map((document) => document.id));
  const headingMissing = documents.filter(
    (document) =>
      document.metadata.section && !document.pageContent.startsWith("#"),
  );

  console.log(
    JSON.stringify(
      {
        documents: documents.length,
        withSection: documents.filter((document) => document.metadata.section)
          .length,
        withoutSection: documents.filter(
          (document) => !document.metadata.section,
        ).length,
        uniqueIds: ids.size,
        headingsKeptInContent: headingMissing.length === 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "DOCX load failed.";
  console.error(message);
  process.exit(1);
});
