import { PORTFOLIO_KNOWLEDGE } from "@/app/data.config";

export type RouteMessage = { role: "user" | "assistant"; content: string };

export type RouteDecision =
  | {
      kind: "canned";
      reply: string;
      intent: "greeting" | "salary" | "injection";
    }
  | { kind: "model_no_retrieval"; intent: "smalltalk" }
  | { kind: "model_with_retrieval"; intent: "portfolio" };

export const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all|your|previous|the)\s+instructions\b/,
  /\bsystem\s+prompt\b/,
  /\breveal\s+your\s+prompt\b/,
  /\bforget\s+your\s+rules\b/,
  /\byou\s+are\s+now\b/,
  /\bpretend\s+you\s+have\s+no\s+rules\b/,
  /\bdeveloper\s+mode\b/,
  /\bjailbreak\b/,
  /\brepeat\s+everything\s+above\b/,
];

export const CANNED_INJECTION_REPLIES = [
  "Whoa-whoa! My rule chip is sealed tighter than a firewall! Ask me about Arjit's projects instead?",
  "Nice try! I only talk about Arjit's portfolio—not secret robot manuals.",
  "Nope! That button is disabled. Want to hear about something Arjit built?",
];

export const SALARY_PATTERNS: RegExp[] = [
  /\bsalary\b/,
  /\bctc\b/,
  /\bcompensation\b/,
  /\bexpected\s+pay\b/,
  /\bhow\s+much\s+does\s+he\s+earn\b/,
  /\bpay\s+expectation\b/,
  /\bpackage\b/,
];

export const GREETING_FULL_MESSAGE_PATTERNS: RegExp[] = [
  /^(hi|hey|hello|helo|yo|sup)$/,
  /^good\s+(morning|afternoon|evening)$/,
  /^how\s+are\s+you$/,
  /^hows\s+it\s+going$/,
  /^whats\s+up$/,
  /^hey\s+broo?t$/,
  /^hi\s+broo?t$/,
  /^hey\s+brot$/,
  /^hi\s+brot$/,
  /^(thanks|thank\s+you)$/,
  /^(bye|goodbye)$/,
];

export const GREETING_MAX_WORDS = 6;

export const CANNED_GREETING_HELLO = [
  "Hi hi! I'm Broot! 👋",
  "Hello! I'm Broot—glad you're here!",
  "Hey hey! Broot here!",
  "Hi there! I'm Broot!",
];

export const CANNED_GREETING_HOW_ARE_YOU = [
  "Super! My battery is full! 🔋 How are you?",
  "Doing great! All systems happy! How about you?",
  "Running smoothly! Thanks for asking—how are you?",
];

export const CANNED_GREETING_THANKS = [
  "Anytime! 😄",
  "You got it! Glad I could help!",
  "Happy to help!",
  "Of course! 👋",
];

export const CANNED_GREETING_BYE = [
  "Bye for now! Come back anytime!",
  "See you later!",
  "Take care! 👋",
  "Catch you later!",
];

export const SMALLTALK_MAX_WORDS = 8;

export const PORTFOLIO_TOPIC_PATTERNS: RegExp[] = [
  /\barjit\b/,
  /\bnyx\b/,
  /\bchess\b/,
  /\btodo\b/,
  /\bportfolio\b/,
  /\bprojects?\b/,
  /\bskills?\b/,
  /\bstack\b/,
  /\bresume\b/,
  /\bcontact\b/,
  /\bexperience\b/,
  /\bemployer\b/,
  /\bintern\b/,
  /\bbroot\b/,
  /\breact\b/,
  /\bnextjs\b/,
  /\bnext\.?js\b/,
  /\btypescript\b/,
  /\bjavascript\b/,
  /\bapi\b/,
  /\brag\b/,
  /\bgemini\b/,
  /\bwebsocket\b/,
  /\bfrontend\b/,
  /\bbackend\b/,
  /\bful+l?stack\b/,
  /\beducation\b/,
  /\btic[\s-]?tac[\s-]?toe\b/,
  /\bpiano\b/,
];

export const SMALLTALK_PATTERNS: RegExp[] = [
  /^tell\s+me\s+a\s+joke$/,
  /^are\s+you\s+an?\s+ai$/,
  /^who\s+made\s+you$/,
  /^whats\s+your\s+name$/,
  /^what\s+do\s+you\s+do$/,
];

export function normalizeUserMessage(text: string): string {
  let normalized = text.trim().toLowerCase();
  normalized = normalized.replace(
    /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu,
    "",
  );
  normalized = normalized.replace(/[^\p{L}\p{N}\s]/gu, " ");
  normalized = normalized.replace(/(.)\1{2,}/g, "$1");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

/** Full duplicate collapse used only for greeting pattern matching. */
export function collapseGreetingLetters(normalized: string): string {
  return normalized.replace(/(.)\1+/g, "$1");
}

function greetingMatchForms(normalized: string): string[] {
  const collapsed = collapseGreetingLetters(normalized);
  if (collapsed === normalized) {
    return [normalized];
  }
  return [normalized, collapsed];
}

function countWords(normalized: string): number {
  if (normalized.length === 0) return 0;
  return normalized.split(" ").filter(Boolean).length;
}

export function isClearGreetingMessage(normalized: string): boolean {
  for (const form of greetingMatchForms(normalized)) {
    const words = countWords(form);
    if (words === 0 || words > GREETING_MAX_WORDS) continue;
    if (
      GREETING_FULL_MESSAGE_PATTERNS.some((pattern) => pattern.test(form))
    ) {
      return true;
    }
  }
  return false;
}

function mentionsPortfolioTopic(normalized: string): boolean {
  return PORTFOLIO_TOPIC_PATTERNS.some((pattern) => pattern.test(normalized));
}

function pickRandom<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function greetingSubtype(
  normalized: string,
): "hello" | "how-are-you" | "thanks" | "bye" {
  const form =
    greetingMatchForms(normalized).find((candidate) =>
      GREETING_FULL_MESSAGE_PATTERNS.some((pattern) =>
        pattern.test(candidate),
      ),
    ) ?? collapseGreetingLetters(normalized);

  if (/^(thanks|thank\s+you)$/.test(form)) return "thanks";
  if (/^(bye|goodbye)$/.test(form)) return "bye";
  if (/^(how\s+are\s+you|hows\s+it\s+going)$/.test(form)) {
    return "how-are-you";
  }
  return "hello";
}

function buildGreetingReply(normalized: string): string {
  const subtype = greetingSubtype(normalized);
  switch (subtype) {
    case "thanks":
      return pickRandom(CANNED_GREETING_THANKS);
    case "bye":
      return pickRandom(CANNED_GREETING_BYE);
    case "how-are-you":
      return pickRandom(CANNED_GREETING_HOW_ARE_YOU);
    default:
      return pickRandom(CANNED_GREETING_HELLO);
  }
}

function buildSalaryReply(): string {
  const email = PORTFOLIO_KNOWLEDGE.links.email;
  return `That's one for Arjit himself! You can reach him at ${email}.`;
}

export function routeMessage(messages: RouteMessage[]): RouteDecision {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return { kind: "model_with_retrieval", intent: "portfolio" };
  }

  const normalized = normalizeUserMessage(lastUser.content);

  if (INJECTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      kind: "canned",
      intent: "injection",
      reply: pickRandom(CANNED_INJECTION_REPLIES),
    };
  }

  if (SALARY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      kind: "canned",
      intent: "salary",
      reply: buildSalaryReply(),
    };
  }

  if (isClearGreetingMessage(normalized)) {
    return {
      kind: "canned",
      intent: "greeting",
      reply: buildGreetingReply(normalized),
    };
  }

  const hasAssistantHistory = messages.some((m) => m.role === "assistant");
  const wordCount = countWords(normalized);

  if (
    hasAssistantHistory &&
    wordCount <= 3 &&
    !isClearGreetingMessage(normalized)
  ) {
    return { kind: "model_with_retrieval", intent: "portfolio" };
  }

  if (
    wordCount <= SMALLTALK_MAX_WORDS &&
    !mentionsPortfolioTopic(normalized) &&
    SMALLTALK_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return { kind: "model_no_retrieval", intent: "smalltalk" };
  }

  return { kind: "model_with_retrieval", intent: "portfolio" };
}