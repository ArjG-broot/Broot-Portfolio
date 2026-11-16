export const PORTFOLIO_PATH_ROOT = "Arjit Gupta portfolio";

/** Minimum body size before a section is kept as its own chunk (heading excluded). */
export const MIN_SUBSTANTIVE_SECTION_CHARS = 150;

export const DEFAULT_RETRIEVAL_LIMIT = 6;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

export type KnowledgeChunkType =
  | "overview"
  | "experience"
  | "project"
  | "education"
  | "skills"
  | "goals";

/** Section titles omitted from vector ingest (guidance lives in chat system prompt). */
export const INGEST_EXCLUDED_SECTION_TITLES = [
  "Response Guidance for the Portfolio Chatbot",
  "Tone",
  "Accuracy",
  "Useful Answer Pattern",
  "Update Checklist",
] as const;

export function normalizeSectionTitle(title: string): string {
  return title
    .replace(/^#+\s*/, "")
    .replace(/\\([().\-])/g, "$1")
    .trim()
    .toLowerCase();
}

export function isIngestExcludedSection(sectionTitle: string): boolean {
  const normalized = normalizeSectionTitle(sectionTitle);
  return INGEST_EXCLUDED_SECTION_TITLES.some(
    (excluded) => normalizeSectionTitle(excluded) === normalized,
  );
}
