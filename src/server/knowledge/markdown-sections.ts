import type { KnowledgeDocument } from "./document";

const HEADING = /^(#{1,6})[ \t]+(.+?)\s*$/;

export function documentsFromMarkdown(
  markdown: string,
  sourceId: string,
): KnowledgeDocument[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ section?: string; lines: string[] }> = [];
  let current: { section?: string; lines: string[] } | undefined;

  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading) {
      current = { section: heading[2].trim(), lines: [line] };
      blocks.push(current);
      continue;
    }

    if (!current) {
      current = { lines: [] };
      blocks.push(current);
    }

    current.lines.push(line);
  }

  return blocks
    .map((block) => ({
      section: block.section,
      pageContent: block.lines.join("\n").trim(),
    }))
    .filter((block) => block.pageContent.length > 0)
    .map((block, index) => ({
      id: `${sourceId}:${index}`,
      pageContent: block.pageContent,
      metadata: {
        sourceId,
        ...(block.section ? { section: block.section } : {}),
      },
    }));
}
