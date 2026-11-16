import type { KnowledgeDocument } from "./document";
import {
  isIngestExcludedSection,
  MIN_SUBSTANTIVE_SECTION_CHARS,
  PORTFOLIO_PATH_ROOT,
  type KnowledgeChunkType,
} from "./ingestion-config";
import { chunkDocuments } from "./chunk-documents";
import {
  isHeadingOnlySection,
  preprocessMarkdown,
  stripLeadingHeading,
  substantiveBodyLength,
} from "./markdown-preprocess";

const HEADING = /^(#{1,6})[ \t]+(.+?)\s*$/;

type ParsedSection = {
  section: string;
  sectionPath: string[];
  pageContent: string;
  chunkType: KnowledgeChunkType;
  projectName: string | null;
};

export function buildIngestSectionDocuments(
  markdown: string,
  sourceId: string,
): KnowledgeDocument[] {
  const preprocessed = preprocessMarkdown(markdown);
  const sections = mergeSmallSections(
    parseMarkdownSections(preprocessed).filter(
      (section) => !isIngestExcludedSection(section.section),
    ),
    MIN_SUBSTANTIVE_SECTION_CHARS,
  );

  return sections.map((section, index) => ({
    id: `${sourceId}:doc:${index}`,
    pageContent: section.pageContent,
    metadata: {
      sourceId,
      section: section.section,
      sectionPath: section.sectionPath.join(" > "),
      chunkType: section.chunkType,
      projectName: section.projectName,
    },
  }));
}

export function buildKnowledgeChunksFromMarkdown(
  markdown: string,
  sourceId: string,
): KnowledgeDocument[] {
  const documents = buildIngestSectionDocuments(markdown, sourceId);

  return documents.flatMap((document) => {
    const chunks = chunkDocuments([document]);
    return chunks.map((chunk) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        sectionPath: document.metadata.sectionPath,
        chunkType: document.metadata.chunkType,
        projectName: document.metadata.projectName,
        embeddingText: formatEmbeddingText(
          document.metadata.sectionPath ?? document.metadata.section ?? "",
          document.metadata.section ?? "",
          chunk.pageContent,
        ),
      },
    }));
  });
}

export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: ParsedSection[] = [];
  const stack: Array<{ level: number; title: string }> = [];
  let currentLines: string[] | null = null;
  let currentSection = "";

  const flush = () => {
    if (!currentLines) return;
    const pageContent = currentLines.join("\n").trim();
    if (pageContent.length === 0) {
      currentLines = null;
      return;
    }

    const path = stack.map((entry) => entry.title);
    sections.push({
      section: currentSection,
      sectionPath: path,
      pageContent,
      chunkType: inferChunkType(path, currentSection),
      projectName: inferProjectName(path, currentSection),
    });
    currentLines = null;
  };

  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const title = heading[2].trim();

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      stack.push({ level, title });
      currentSection = title;
      currentLines = [line];
      continue;
    }

    if (!currentLines) {
      currentSection = "Portfolio Knowledge Base";
      stack.length = 0;
      stack.push({ level: 1, title: currentSection });
      currentLines = [];
    }

    currentLines.push(line);
  }

  flush();
  return sections;
}

export function mergeSmallSections(
  sections: ParsedSection[],
  minBodyChars: number,
): ParsedSection[] {
  if (sections.length === 0) return [];

  const merged: ParsedSection[] = [];
  let pending: ParsedSection | null = null;

  const mergeInto = (target: ParsedSection, source: ParsedSection) => {
    target.pageContent = `${target.pageContent}\n\n${source.pageContent}`.trim();
  };

  for (const section of sections) {
    let current = section;

    if (pending) {
      mergeInto(current, pending);
      pending = null;
    }

    const tooSmall =
      isHeadingOnlySection(current.pageContent) ||
      substantiveBodyLength(current.pageContent) < minBodyChars;

    if (tooSmall) {
      pending = current;
      continue;
    }

    merged.push(current);
  }

  if (pending) {
    if (merged.length > 0) {
      mergeInto(merged[merged.length - 1], pending);
    } else {
      merged.push(pending);
    }
  }

  return merged.map((section) => ({
    ...section,
    chunkType: inferChunkType(section.sectionPath, section.section),
    projectName: inferProjectName(section.sectionPath, section.section),
  }));
}

export function inferChunkType(
  path: string[],
  section: string,
): KnowledgeChunkType {
  const trimmedSection = section.trim();

  if (/^profile:/i.test(trimmedSection)) return "overview";
  if (/^education:/i.test(trimmedSection)) return "education";
  if (/^experience:/i.test(trimmedSection)) return "experience";
  if (/^projects?:/i.test(trimmedSection)) return "project";
  if (/^skills:/i.test(trimmedSection)) return "skills";
  if (/^career:/i.test(trimmedSection)) return "goals";
  if (/^approach:/i.test(trimmedSection)) return "goals";
  if (/^interests:/i.test(trimmedSection)) return "overview";

  const haystack = `${path.join(" ")} ${section}`.toLowerCase();

  if (haystack.includes("education")) return "education";
  if (haystack.includes("technical skills") || haystack.includes("skills and tools")) {
    return "skills";
  }
  if (haystack.includes("career direction") || haystack.includes("learning approach")) {
    return "goals";
  }
  if (
    haystack.includes(" nyx") ||
    haystack.startsWith("2.") ||
    haystack.includes("professional experience summary") ||
    haystack.includes("key contributions")
  ) {
    return "experience";
  }
  if (
    haystack.includes("projects") ||
    /^3\./.test(section) ||
    /broot-|tic-tac-toe|piano project|project overview/i.test(haystack)
  ) {
    return "project";
  }

  return "overview";
}

const NUMBERED_PROJECT_HEADING = /^3\.\d+\s+(.+)$/i;
const PROJECTS_SECTION = /^3\.\s*Projects$/i;

function normalizeProjectTitle(title: string): string {
  return title.split(/---|—/)[0].trim();
}

function nearestNumberedProjectName(path: string[]): string | null {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const match = path[index].match(NUMBERED_PROJECT_HEADING);
    if (match) {
      return normalizeProjectTitle(match[1]);
    }
  }

  return null;
}

function isSummaryBlockUnderProjects(path: string[]): boolean {
  const underProjects = path.some((entry) => PROJECTS_SECTION.test(entry));
  const hasNumberedProject = path.some((entry) =>
    NUMBERED_PROJECT_HEADING.test(entry),
  );

  return underProjects && !hasNumberedProject;
}

function projectIdentityFromTitle(title: string): string {
  const withoutSuffix = title.trim().split(/\s+[—–-]\s+|\s+\(/)[0].trim();
  return normalizeProjectTitle(withoutSuffix);
}

function projectNameFromPrefixedHeading(section: string): string | null {
  if (/^Projects:\s*/i.test(section.trim())) {
    return null;
  }

  const match = section.trim().match(/^Project:\s*(.+)$/i);
  if (!match) {
    return null;
  }

  return projectIdentityFromTitle(match[1]);
}

function projectNameFromSummarySection(section: string): string | null {
  if (/^broot-/i.test(section)) {
    return normalizeProjectTitle(section);
  }

  if (/^tic-tac-toe$/i.test(section.trim())) {
    return "Tic-Tac-Toe";
  }

  if (/^piano project$/i.test(section.trim())) {
    return "Piano Project";
  }

  return null;
}

export function inferProjectName(
  path: string[],
  section: string,
): string | null {
  const fromPrefixedHeading = projectNameFromPrefixedHeading(section);
  if (fromPrefixedHeading) {
    return fromPrefixedHeading;
  }

  const selfNumbered = section.match(NUMBERED_PROJECT_HEADING);
  if (selfNumbered) {
    return normalizeProjectTitle(selfNumbered[1]);
  }

  const fromNumberedAncestor = nearestNumberedProjectName(path);
  if (fromNumberedAncestor) {
    return fromNumberedAncestor;
  }

  if (isSummaryBlockUnderProjects(path)) {
    return projectNameFromSummarySection(section);
  }

  return null;
}

export function formatEmbeddingText(
  sectionPath: string,
  sectionTitle: string,
  pageContent: string,
): string {
  const { body } = stripLeadingHeading(pageContent);
  const text = body.trim().length > 0 ? body.trim() : pageContent.trim();
  const pathParts = sectionPath
    ? sectionPath.split(" > ").filter(Boolean)
    : [sectionTitle].filter(Boolean);

  const leaf =
    pathParts.length > 0 ? pathParts[pathParts.length - 1] : sectionTitle;

  const prefixPath = [...pathParts];
  if (prefixPath[prefixPath.length - 1] !== sectionTitle && sectionTitle) {
    prefixPath.push(sectionTitle);
  }

  const pathLabel = [PORTFOLIO_PATH_ROOT, ...prefixPath].join(" > ");
  return `${pathLabel}: ${text}`;
}
