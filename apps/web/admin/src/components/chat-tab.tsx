"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { components } from "@multiproject-rag/contracts";
import { Send, User, Bot, FileText, Loader2 } from "lucide-react";

type ChatSource = components["schemas"]["ChatSource"];

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  streaming?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STREAM_TIMEOUT_MS = 120_000;
const TOKEN_TIMEOUT_MS = 30_000;

export function ChatTab({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const clearTimeout_ = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const resetTimeout = useCallback(
    (controller: AbortController) => {
      clearTimeout_();
      timeoutRef.current = setTimeout(() => {
        controller.abort();
      }, TOKEN_TIMEOUT_MS);
    },
    []
  );

  const finishStreaming = useCallback(
    (error?: string) => {
      clearTimeout_();
      setStreaming(false);
      abortRef.current = null;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          next[next.length - 1] = {
            ...last,
            content: error
              ? last.content
                ? `${last.content}\n\nError: ${error}`
                : `Error: ${error}`
              : last.content || "(no response)",
            streaming: false,
          };
        }
        return next;
      });
    },
    []
  );

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;

    const message = input.trim();
    setInput("");
    setStreaming(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "", streaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    // Global timeout for the entire stream
    const globalTimeout = setTimeout(() => {
      controller.abort();
    }, STREAM_TIMEOUT_MS);

    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${projectId}/chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, session_id: sessionId }),
          signal: controller.signal,
        }
      );

      clearTimeout(globalTimeout);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Stream request failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      // Start per-token timeout
      resetTimeout(controller);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "token") {
              resetTimeout(controller);
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    content: last.content + event.content,
                  };
                }
                return next;
              });
            } else if (event.type === "done") {
              clearTimeout_();
              if (event.session_id) {
                setSessionId(event.session_id);
              }
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    streaming: false,
                    sources: event.sources || [],
                  };
                }
                return next;
              });
            } else if (event.type === "error") {
              finishStreaming(event.message);
              return;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      // Stream ended without done event
      finishStreaming();
    } catch (err) {
      clearTimeout(globalTimeout);
      if ((err as Error).name === "AbortError") {
        finishStreaming("Request timed out or was cancelled");
        return;
      }
      finishStreaming((err as Error).message);
    }
  }, [input, streaming, projectId, sessionId, resetTimeout, finishStreaming]);

  const handleCancel = () => {
    clearTimeout_();
    abortRef.current?.abort();
    finishStreaming("Cancelled");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      <div className="flex-1 overflow-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-zinc-400">
              Ask a question about this project&apos;s documents.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {msg.role === "user" ? (
                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-400 mb-1">
                {msg.role === "user" ? "You" : "Assistant"}
              </p>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {msg.content}
                {msg.streaming && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
                )}
              </div>

              {!msg.streaming && msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs font-medium text-zinc-400 mb-1">
                    Sources
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {msg.sources.map((src, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                      >
                        <FileText className="w-3 h-3" />
                        {src.title || src.document_id.slice(0, 8)}
                        {src.score != null && (
                          <span className="text-zinc-400">
                            ({Math.round(src.score * 100)}%)
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={2}
          disabled={streaming}
          className="flex-1 resize-none px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm disabled:opacity-50"
        />
        {streaming ? (
          <button
            onClick={handleCancel}
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 text-sm flex items-center gap-1.5"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black text-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        )}
      </div>
    </div>
  );
}
