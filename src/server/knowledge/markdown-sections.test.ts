import assert from "node:assert/strict";
import test from "node:test";
import { documentsFromMarkdown } from "./markdown-sections";

test("splits markdown into preamble and heading sections", () => {
  const documents = documentsFromMarkdown(
    "Intro line\n\n# Projects\nChess\n\n## Todo\nTasks\n",
    "dossier",
  );

  assert.deepEqual(
    documents.map((document) => ({
      id: document.id,
      section: document.metadata.section ?? null,
      pageContent: document.pageContent,
    })),
    [
      {
        id: "dossier:0",
        section: null,
        pageContent: "Intro line",
      },
      {
        id: "dossier:1",
        section: "Projects",
        pageContent: "# Projects\nChess",
      },
      {
        id: "dossier:2",
        section: "Todo",
        pageContent: "## Todo\nTasks",
      },
    ],
  );
});

test("omits a title when the markdown has none", () => {
  const [document] = documentsFromMarkdown("# Only\nBody", "dossier");
  assert.equal("title" in document.metadata, false);
  assert.equal(document.metadata.sourceId, "dossier");
});

test("returns no documents for blank markdown", () => {
  assert.deepEqual(documentsFromMarkdown(" \n\n ", "dossier"), []);
});
