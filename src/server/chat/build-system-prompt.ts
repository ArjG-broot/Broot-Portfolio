import { PORTFOLIO_KNOWLEDGE } from "@/app/data.config";
import { PORTFOLIO_CHAT_RESPONSE_GUIDANCE } from "@/server/knowledge/portfolio-chat-guidance";
import type { ExpandedKnowledgeChunk } from "@/server/knowledge/knowledge-retrieval";

export const CHAT_CORE_INSTRUCTION = [
  "You answer questions about Arjit Gupta's portfolio.",
  "The retrieved context below is the only factual source.",
  "Do not invent employers, dates, education, metrics, project features, or achievements that are not in that knowledge.",
  "If a detail is missing, say you don't know.",
  "Earlier assistant messages are conversational context only, not verified facts. If they conflict with the retrieved context, follow the retrieved context.",
].join("\n");

export const RETRIEVED_CONTEXT_USAGE_HINT =
  "The retrieved context for a topic may include several consecutive sections. Use all of them to give a complete answer, then summarize concisely.";

export function formatRetrievedContextBlock(
  chunks: ExpandedKnowledgeChunk[],
): string {
  if (chunks.length === 0) return "";

  return chunks
    .map((chunk) => `[${chunk.section ?? "Untitled"}]\n${chunk.content}`)
    .join("\n\n");
}

export function buildRagSystemInstruction(retrievedContext: string): string {
  return [
    CHAT_CORE_INSTRUCTION,
    "",
    PORTFOLIO_CHAT_RESPONSE_GUIDANCE,
    "",
    RETRIEVED_CONTEXT_USAGE_HINT,
    "",
    "Retrieved context:",
    retrievedContext,
  ].join("\n");
}

/** Full static prompt used when retrieval is unavailable (matches prior chat behavior). */
export function buildStaticPortfolioInstruction(): string {
  const { profile, links, skills, projects, sideProjects, hobbies } =
    PORTFOLIO_KNOWLEDGE;

  const projectLines = projects
    .map((project) => `- ${project.title} (${project.link}): ${project.brief}`)
    .join("\n");
  const sideProjectLines = sideProjects
    .map((project) => `- ${project.name}: ${project.note}`)
    .join("\n");

  return [
    "You answer questions about Arjit Gupta's portfolio.",
    "The portfolio knowledge below is the only factual source.",
    "Do not invent employers, dates, education, metrics, project features, or achievements that are not in that knowledge.",
    "If a detail is missing, say you don't know.",
    "Earlier assistant messages are conversational context only, not verified facts. If they conflict with the portfolio knowledge, follow the knowledge.",
    "",
    `Name: ${profile.name}`,
    `Role: ${profile.role}`,
    `Focus: ${profile.focus}`,
    `Availability: ${profile.availability}`,
    "",
    `Site: ${links.site}`,
    `Email: ${links.email}`,
    `GitHub: ${links.github}`,
    `LinkedIn: ${links.linkedin}`,
    `X: ${links.x}`,
    "",
    `Frontend: ${skills.frontend.join(", ")}`,
    `Backend: ${skills.backend.join(", ")}`,
    `Languages: ${skills.languages.join(", ")}`,
    `Tools: ${skills.tools.join(", ")}`,
    "",
    "Projects:",
    projectLines,
    "",
    "Side projects:",
    sideProjectLines,
    "",
    `Hobbies: ${hobbies.join(", ")}`,
  ].join("\n");
}

export type RetrievalChatMessage = { role: "user" | "assistant"; content: string };

export function buildRetrievalQuery(messages: RetrievalChatMessage[]): string {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  const last = userMessages[userMessages.length - 1] ?? "";

  if (last.length >= 40) {
    return last;
  }

  const previous = userMessages[userMessages.length - 2];
  if (previous) {
    return `${previous}\n${last}`;
  }

  return last;
}