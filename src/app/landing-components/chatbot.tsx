"use client";

import { useEffect, useId, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const MAX_CONTENT_LENGTH = 2000;
const MAX_MESSAGES = 12;

export default function Chatbot() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      inputRef.current?.focus();
      return;
    }

    if (wasOpen.current) {
      launcherRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages, loading, open]);

  async function sendMessage() {
    if (sendingRef.current || loading) return;

    const content = draft.trim();

    if (content.length === 0) {
      setError("Enter a message first.");
      return;
    }

    const previousMessages = messages;
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];

    sendingRef.current = true;

    try {
      setDraft("");
      setError(null);
      setMessages(nextMessages);
      setLoading(true);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.slice(-MAX_MESSAGES),
        }),
      });

      const payload: unknown = await response.json().catch(() => null);
      const reply =
        payload &&
        typeof payload === "object" &&
        "reply" in payload &&
        typeof payload.reply === "string"
          ? payload.reply.trim()
          : "";
      const apiError =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "";

      if (!response.ok || reply.length === 0) {
        setMessages(previousMessages);
        setDraft(content);
        setError(apiError || "The assistant is unavailable right now.");
        return;
      }

      setMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch {
      setMessages(previousMessages);
      setDraft(content);
      setError("The assistant is unavailable right now.");
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        ref={launcherRef}
        type="button"
        aria-label="Open chat"
        aria-expanded={false}
        aria-controls="portfolio-chat"
        onClick={() => setOpen(true)}
        className="play-regular fixed bottom-4 right-4 z-[160] flex size-14 cursor-pointer items-center justify-center rounded-full border border-red-800/80 bg-red-950/80 text-[11px] text-gray-100 hover:drop-shadow-[0_0_10px_rgb(220_0_0_/.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
      >
        Chat
      </button>
    );
  }

  return (
    <section
      id="portfolio-chat"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="play-regular fixed bottom-4 right-4 z-[160] flex h-[min(70vh,32rem)] w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-md border border-red-800/80 bg-[#0b0b0b] text-gray-100 shadow-[0_0_24px_rgb(80_0_0_/_0.45)]"
    >
      <div className="flex items-center justify-between border-b border-red-800/70 px-3 py-2">
        <h2 id={titleId} className="text-sm text-gray-200">
          Ask about Arjit
        </h2>
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-md border border-red-800/70 px-2 py-1 text-[11px] text-gray-300 hover:bg-red-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        >
          Close
        </button>
      </div>

      <div
        ref={listRef}
        tabIndex={0}
        aria-label="Messages"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-400"
      >
        {messages.length === 0 && (
          <p className="text-[12px] text-gray-400">
            Ask about Arjit&apos;s projects and experience.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[85%] whitespace-pre-wrap rounded-md border px-2 py-1.5 text-[12px] ${
              message.role === "user"
                ? "ml-auto border-red-800/70 bg-red-950/40"
                : "mr-auto border-white/10 bg-gray-700/20"
            }`}
          >
            <span className="sr-only">
              {message.role === "user" ? "You" : "Assistant"}:{" "}
            </span>
            {message.content}
          </div>
        ))}
        {loading && (
          <p className="text-[12px] text-gray-400" role="status">
            Thinking...
          </p>
        )}
      </div>

      {error && (
        <p className="px-3 pb-1 text-[12px] text-red-300" role="alert">
          {error}
        </p>
      )}

      <form
        className="flex items-end gap-2 border-t border-red-800/70 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <label htmlFor="portfolio-chat-input" className="sr-only">
          Message
        </label>
        <TextareaAutosize
          id="portfolio-chat-input"
          ref={inputRef}
          value={draft}
          maxLength={MAX_CONTENT_LENGTH}
          minRows={1}
          maxRows={4}
          placeholder="Message..."
          disabled={loading}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          className="max-h-28 min-h-10 w-full resize-none rounded-md border border-red-800 bg-gray-700/10 p-2 text-[12px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || draft.trim().length === 0}
          className="h-10 shrink-0 cursor-pointer rounded-md border border-red-800/70 bg-red-950/40 px-3 text-[11px] hover:bg-red-900/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sending" : "Send"}
        </button>
      </form>
    </section>
  );
}
