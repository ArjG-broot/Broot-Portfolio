import { NextResponse } from "next/server";
import { PORTFOLIO_KNOWLEDGE } from "@/app/data.config";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_MESSAGES = 12;
const MAX_CONTENT_LENGTH = 2000;
const MAX_BODY_BYTES = 128 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

function declaredBodyTooLarge(request: Request): boolean {
  const header = request.headers.get("content-length");
  if (header === null) return false;

  const bytes = Number(header);
  return !Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_BODY_BYTES;
}

function portfolioInstruction(): string {
  const { profile, links, skills, projects, sideProjects, hobbies } =
    PORTFOLIO_KNOWLEDGE;

  const projectLines = projects
    .map(
      (project) =>
        `- ${project.title} (${project.link}): ${project.brief}`,
    )
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

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMessages(body: unknown): ChatMessage[] | string {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return "Request body must be { messages: [{ role, content }] }.";
  }

  if (body.messages.length === 0) {
    return "messages must not be empty.";
  }

  if (body.messages.length > MAX_MESSAGES) {
    return `A request can include at most ${MAX_MESSAGES} messages.`;
  }

  const messages: ChatMessage[] = [];

  for (const item of body.messages) {
    if (!isRecord(item)) {
      return "Each message must be an object with role and content.";
    }

    if (item.role !== "user" && item.role !== "assistant") {
      return 'Each message role must be "user" or "assistant".';
    }

    if (typeof item.content !== "string") {
      return "Each message content must be a string.";
    }

    const content = item.content.trim();

    if (content.length === 0) {
      return "Message content must not be empty.";
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return `Each message must be at most ${MAX_CONTENT_LENGTH} characters.`;
    }

    messages.push({ role: item.role, content });
  }

  while (messages.length > 0 && messages[0].role !== "user") {
    messages.shift();
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return "The latest message must be from the user.";
  }

  for (let index = 1; index < messages.length; index += 1) {
    if (messages[index].role === messages[index - 1].role) {
      return "Messages must alternate between user and assistant.";
    }
  }

  return messages;
}

function replyFromGemini(payload: GeminiResponse): string | null {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
}

const GEMINI_LOG_PREFIX = "[api/chat]";

function sanitizeProviderBody(body: string): string {
  return body
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED]")
    .replace(/x-goog-api-key["'\s:]+[^\s"']+/gi, "[REDACTED]")
    .slice(0, 500);
}

function geminiFailureKindFromError(error: unknown): "timeout" | "network" {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "timeout";
    }
  }
  return "network";
}

function logGeminiFailure(
  kind: "timeout" | "network" | "non_2xx" | "parse" | "empty_reply",
  details: Record<string, string | number | boolean | undefined>,
) {
  console.error(`${GEMINI_LOG_PREFIX} gemini_failure`, { kind, ...details });
}

export async function POST(request: Request) {
  if (declaredBodyTooLarge(request)) {
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const messages = parseMessages(body);

  if (typeof messages === "string") {
    const status =
      messages === `A request can include at most ${MAX_MESSAGES} messages.`
        ? 413
        : 400;
    return NextResponse.json({ error: messages }, { status });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Chat is not configured." },
      { status: 500 },
    );
  }

  console.info(`${GEMINI_LOG_PREFIX} gemini_fetch_start`, {
    model: GEMINI_MODEL,
    messageCount: messages.length,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: portfolioInstruction(),
            },
          ],
        },
        contents: messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
      }),
    });

    if (!response.ok) {
      const rawBody = await response.text().catch(() => "");
      logGeminiFailure("non_2xx", {
        status: response.status,
        statusText: response.statusText,
        bodyPreview: sanitizeProviderBody(rawBody),
      });
      return NextResponse.json(
        { error: "The assistant is unavailable right now." },
        { status: 502 },
      );
    }

    let payload: GeminiResponse;

    try {
      payload = (await response.json()) as GeminiResponse;
    } catch (error) {
      logGeminiFailure("parse", {
        status: response.status,
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage:
          error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
      return NextResponse.json(
        { error: "The assistant is unavailable right now." },
        { status: 502 },
      );
    }

    const reply = replyFromGemini(payload);

    if (!reply) {
      logGeminiFailure("empty_reply", {
        status: response.status,
        candidateCount: payload.candidates?.length ?? 0,
      });
      return NextResponse.json(
        { error: "The assistant did not return a reply." },
        { status: 502 },
      );
    }

    console.info(`${GEMINI_LOG_PREFIX} gemini_fetch_ok`, {
      status: response.status,
      messageCount: messages.length,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    const kind = geminiFailureKindFromError(error);
    logGeminiFailure(kind, {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage:
        error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return NextResponse.json(
      { error: "The assistant is unavailable right now." },
      { status: 502 },
    );
  }
}
