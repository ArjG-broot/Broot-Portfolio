import assert from "node:assert/strict";
import test from "node:test";
import {
  formatEmbeddingText,
  inferProjectName,
  mergeSmallSections,
  parseMarkdownSections,
} from "./build-ingest-chunks";
import { isIngestExcludedSection } from "./ingestion-config";
import {
  isHeadingOnlySection,
  preprocessMarkdown,
  substantiveBodyLength,
} from "./markdown-preprocess";

test("preprocessMarkdown removes escapes and bold markers", () => {
  const input = "Hello \\(world\\) and __Bold__ text\\.";
  assert.equal(
    preprocessMarkdown(input),
    "Hello (world) and Bold text.",
  );
});

test("mergeSmallSections merges heading-only blocks into the next section", () => {
  const merged = mergeSmallSections(
    [
      {
        section: "3. Projects",
        sectionPath: ["3. Projects"],
        pageContent: "## 3. Projects",
        chunkType: "project",
        projectName: null,
      },
      {
        section: "Project Overview",
        sectionPath: ["3. Projects", "Project Overview"],
        pageContent:
          "### Project Overview\n\n- **Broot-Portfolio:** Personal portfolio.",
        chunkType: "project",
        projectName: null,
      },
    ],
    150,
  );

  assert.equal(merged.length, 1);
  assert.ok(substantiveBodyLength(merged[0].pageContent) >= 20);
  assert.equal(isHeadingOnlySection(merged[0].pageContent), false);
});

test("ingest filter drops LLM guidance section titles", () => {
  const sections = parseMarkdownSections(`## 8. Response Guidance for the Portfolio Chatbot

### Useful Answer Pattern

For a project question, answer with details.

## 3. Projects

### Project Overview

- Broot-Portfolio: example.`).filter((section) => !isIngestExcludedSection(section.section));

  assert.equal(isIngestExcludedSection("Useful Answer Pattern"), true);
  assert.ok(sections.some((section) => section.section === "Project Overview"));
  assert.ok(
    sections.every((section) => !isIngestExcludedSection(section.section)),
  );
});

test("inferProjectName resolves numbered project sections", () => {
  assert.equal(
    inferProjectName(["3. Projects", "3.1 Broot-Portfolio"], "3.1 Broot-Portfolio"),
    "Broot-Portfolio",
  );
  assert.equal(
    inferProjectName(["3. Projects", "3.2 Broot-Chess"], "3.2 Broot-Chess"),
    "Broot-Chess",
  );
  assert.equal(
    inferProjectName(
      ["3. Projects", "3.3 Broot-Todo --- AI Task Manager"],
      "3.3 Broot-Todo --- AI Task Manager",
    ),
    "Broot-Todo",
  );
  assert.equal(
    inferProjectName(["3. Projects", "3.3 Broot-Todo — AI Task Manager"], "Overview"),
    "Broot-Todo",
  );
  assert.equal(
    inferProjectName(["3. Projects", "3.4 Tic-Tac-Toe"], "3.4 Tic-Tac-Toe"),
    "Tic-Tac-Toe",
  );
  assert.equal(
    inferProjectName(["3. Projects", "3.5 Piano Project"], "3.5 Piano Project"),
    "Piano Project",
  );
});

test("inferProjectName lets numbered project children inherit the project", () => {
  assert.equal(
    inferProjectName(
      ["3. Projects", "3.1 Broot-Portfolio", "AI Chatbot"],
      "AI Chatbot",
    ),
    "Broot-Portfolio",
  );
  assert.equal(
    inferProjectName(
      ["3. Projects", "3.2 Broot-Chess", "Technical Learning"],
      "Technical Learning",
    ),
    "Broot-Chess",
  );
  assert.equal(
    inferProjectName(
      ["3. Projects", "3.3 Broot-Todo --- AI Task Manager", "Implemented Functionality"],
      "Implemented Functionality",
    ),
    "Broot-Todo",
  );
});

test("inferProjectName keeps shared sections null outside a project", () => {
  assert.equal(
    inferProjectName(["3. Projects", "Project Overview"], "Project Overview"),
    null,
  );
  assert.equal(
    inferProjectName(["1. Professional Profile", "Overview"], "Overview"),
    null,
  );
});

test("inferProjectName supports summary blocks directly under 3. Projects", () => {
  assert.equal(
    inferProjectName(["3. Projects", "Broot-Portfolio"], "Broot-Portfolio"),
    "Broot-Portfolio",
  );
  assert.equal(
    inferProjectName(["3. Projects", "Broot-Chess"], "Broot-Chess"),
    "Broot-Chess",
  );
  assert.equal(
    inferProjectName(
      ["3. Projects", "Broot-Todo — AI Task Manager"],
      "Broot-Todo — AI Task Manager",
    ),
    "Broot-Todo",
  );
  assert.equal(
    inferProjectName(["3. Projects", "Tic-Tac-Toe"], "Tic-Tac-Toe"),
    "Tic-Tac-Toe",
  );
  assert.equal(
    inferProjectName(["3. Projects", "Piano Project"], "Piano Project"),
    "Piano Project",
  );
});

test("inferProjectName supports prefixed Project headings", () => {
  assert.equal(
    inferProjectName([], "Projects: Arjit Gupta Independent Projects Overview"),
    null,
  );
  assert.equal(inferProjectName([], "Project: Broot-Portfolio"), "Broot-Portfolio");
  assert.equal(
    inferProjectName([], "Project: Broot-Portfolio — AI Chatbot and RAG Pipeline"),
    "Broot-Portfolio",
  );
  assert.equal(inferProjectName([], "Project: Broot-Chess"), "Broot-Chess");
  assert.equal(
    inferProjectName([], "Project: Broot-Todo (AI Task Manager)"),
    "Broot-Todo",
  );
  assert.equal(inferProjectName([], "Project: Tic-Tac-Toe"), "Tic-Tac-Toe");
  assert.equal(inferProjectName([], "Project: Piano Project"), "Piano Project");
});

test("inferProjectName uses nearest numbered heading, not the first", () => {
  assert.equal(
    inferProjectName(
      ["3. Projects", "3.1 Broot-Portfolio", "3.2 Broot-Chess", "Future Work"],
      "Future Work",
    ),
    "Broot-Chess",
  );
});

test("formatEmbeddingText prefixes the portfolio path", () => {
  const text = formatEmbeddingText(
    "3. Projects > Broot-Chess",
    "Technical Learning",
    "### Technical Learning\n\nChess architecture notes.",
  );

  assert.match(text, /^Arjit Gupta portfolio > 3\. Projects > Broot-Chess/);
  assert.match(text, /Chess architecture notes\./);
});
