const ESCAPED_MARKDOWN_CHAR = /\\([\\().\-])/g;
const BOLD_MARKER = /__([^_\n]+?)__/g;
const HEADING = /^(#{1,6})[ \t]+(.+?)\s*$/;

/** Remove Mammoth-style escapes and normalize bold markers for cleaner chunks. */
export function preprocessMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    line = line.replace(ESCAPED_MARKDOWN_CHAR, "$1");
    line = line.replace(BOLD_MARKER, "$1");

    const converted = convertBrokenTableRow(line, lines[index + 1]);
    if (converted.consumedNext) {
      out.push(converted.line);
      index += 1;
      continue;
    }

    out.push(converted.line);
  }

  return out.join("\n");
}

function convertBrokenTableRow(
  line: string,
  nextLine: string | undefined,
): { line: string; consumedNext: boolean } {
  const trimmed = line.trim();
  const nextTrimmed = nextLine?.trim() ?? "";

  if (
    trimmed.length > 0 &&
    nextTrimmed.length > 0 &&
    !HEADING.test(trimmed) &&
    !HEADING.test(nextTrimmed) &&
    !trimmed.startsWith("-") &&
    !trimmed.startsWith(">") &&
    trimmed.length <= 80 &&
    nextTrimmed.length <= 120 &&
    !trimmed.includes(":") &&
    !nextTrimmed.includes(":")
  ) {
    return {
      line: `${trimmed}: ${nextTrimmed}`,
      consumedNext: true,
    };
  }

  return { line, consumedNext: false };
}

export function stripLeadingHeading(content: string): {
  headingLine: string | null;
  body: string;
} {
  const trimmed = content.trim();
  const newline = trimmed.indexOf("\n");
  const firstLine = newline === -1 ? trimmed : trimmed.slice(0, newline);
  const rest = newline === -1 ? "" : trimmed.slice(newline + 1).trim();

  if (!HEADING.test(firstLine)) {
    return { headingLine: null, body: trimmed };
  }

  return { headingLine: firstLine, body: rest };
}

export function substantiveBodyLength(pageContent: string): number {
  const { body } = stripLeadingHeading(pageContent);
  return body.trim().length;
}

export function isHeadingOnlySection(pageContent: string): boolean {
  return substantiveBodyLength(pageContent) === 0;
}
