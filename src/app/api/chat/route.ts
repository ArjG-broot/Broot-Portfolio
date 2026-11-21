import { NextResponse } from "next/server";
import {
  buildRagSystemInstruction,
  buildRetrievalQuery,
  buildStaticPortfolioInstruction,
  formatRetrievedContextBlock,
  type RetrievalChatMessage,
} from "@/server/chat/build-system-prompt";
import {
  BROOT_UNAVAILABLE_MESSAGE,
  generateWithFallback,
  resolvePrimaryGeminiModel,
} from "@/server/chat/gemini-generate";
import {
  normalizeUserMessage,
  routeMessage,
} from "@/server/chat/intent-router";
import { retrieveWithExpansion } from "@/server/knowledge/knowledge-retrieval";

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
    finishReason?: string;
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

async function resolveSystemInstruction(
  messages: RetrievalChatMessage[],
): Promise<string> {
  const retrievalQuery = buildRetrievalQuery(messages);

  try {
    const chunks = await retrieveWithExpansion(retrievalQuery, {
      sourceId: "portfolio_knowledge",
    });

    if (chunks.length === 0) {
      return buildStaticPortfolioInstruction();
    }

    if (process.env.NODE_ENV !== "production") {
      const contextBlock = formatRetrievedContextBlock(chunks);
      console.info(`${GEMINI_LOG_PREFIX} retrieval_context`, {
        sections: chunks.map((chunk) => ({
          section: chunk.section,
          similarity: chunk.similarity,
          expanded: chunk.expanded,
          projectName: chunk.projectName,
          chunkType: chunk.chunkType,
        })),
        totalContextChars: contextBlock.length,
      });
    }

    return buildRagSystemInstruction(formatRetrievedContextBlock(chunks));
  } catch (error) {
    console.error(`${GEMINI_LOG_PREFIX} retrieval_failed`, {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage:
        error instanceof Error ? error.message.slice(0, 300) : "unknown",
    });
    return buildStaticPortfolioInstruction();
  }
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

  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const normalizedLastMessage = lastUserMessage
    ? normalizeUserMessage(lastUserMessage.content)
    : "";

  const routeDecision = routeMessage(messages);

  if (process.env.NODE_ENV !== "production") {
    console.info(`${GEMINI_LOG_PREFIX} intent_route`, {
      intent: routeDecision.intent,
      kind: routeDecision.kind,
      normalizedLastMessage,
    });
  }

  if (routeDecision.kind === "canned") {
    return NextResponse.json({ reply: routeDecision.reply });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Chat is not configured." },
      { status: 500 },
    );
  }

  const systemInstruction =
    routeDecision.kind === "model_no_retrieval"
      ? buildRagSystemInstruction("")
      : await resolveSystemInstruction(messages);

  const primaryModel = resolvePrimaryGeminiModel();

  console.info(`${GEMINI_LOG_PREFIX} gemini_fetch_start`, {
    model: primaryModel,
    messageCount: messages.length,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  const geminiRequestBody = {
    systemInstruction: {
      parts: [
        {
          text: systemInstruction,
        },
      ],
    },
    contents: messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  };

  try {
    const generation = await generateWithFallback(geminiRequestBody, {
      apiKey,
      perAttemptTimeoutMs: REQUEST_TIMEOUT_MS,
    });

    if (!generation.ok) {
      console.error(`${GEMINI_LOG_PREFIX} gemini_exhausted`, {
        modelsTried: generation.modelsTried,
        statuses: generation.statuses,
        attempts: generation.attempts,
        latencyMs: generation.latencyMs,
      });
      return NextResponse.json(
        { error: BROOT_UNAVAILABLE_MESSAGE },
        { status: 503 },
      );
    }

    const { response, model, attempts, latencyMs } = generation;

    if (process.env.NODE_ENV !== "production") {
      console.info(`${GEMINI_LOG_PREFIX} gemini_answered`, {
        model,
        attempts,
        latencyMs,
      });
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

    const finishReason = payload.candidates?.[0]?.finishReason;
    const reply = replyFromGemini(payload);

    if (!reply) {
      logGeminiFailure("empty_reply", {
        status: response.status,
        candidateCount: payload.candidates?.length ?? 0,
        finishReason,
      });
      return NextResponse.json(
        { error: "The assistant did not return a reply." },
        { status: 502 },
      );
    }

    if (finishReason === "MAX_TOKENS") {
      console.info(`${GEMINI_LOG_PREFIX} gemini_max_tokens`, {
        messageCount: messages.length,
      });
    }

    console.info(`${GEMINI_LOG_PREFIX} gemini_fetch_ok`, {
      status: response.status,
      model,
      messageCount: messages.length,
      finishReason,
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
      { error: BROOT_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
}