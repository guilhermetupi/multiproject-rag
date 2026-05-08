"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api-client";
import type { components } from "@multiproject-rag/contracts";
import {
  MessageCircle,
  ChevronRight,
  User,
  Bot,
  Clock,
} from "lucide-react";

type ChatSessionResponse = components["schemas"]["ChatSessionResponse"];
type ChatSessionDetailResponse =
  components["schemas"]["ChatSessionDetailResponse"];

export function SessionsTab({ projectId }: { projectId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions", projectId],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/projects/{project_id}/chat/sessions",
        { params: { path: { project_id: projectId } } }
      );
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading sessions...</p>;
  }

  if (sessions?.length === 0) {
    return (
      <p className="text-sm text-zinc-400 text-center py-8">
        No chat sessions yet. Start a chat to create one.
      </p>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Session list */}
      <div className="w-72 flex-shrink-0 space-y-1">
        {sessions?.map((session) => (
          <button
            key={session.id}
            onClick={() =>
              setSelectedId(
                selectedId === session.id ? null : session.id
              )
            }
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
              selectedId === session.id
                ? "bg-zinc-100 dark:bg-zinc-800"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
            <span className="truncate flex-1 font-mono text-xs">
              {session.id.slice(0, 8)}
            </span>
            <span className="text-xs text-zinc-400">
              {new Date(session.created_at).toLocaleDateString()}
            </span>
            <ChevronRight
              className={`w-3 h-3 text-zinc-400 transition-transform ${selectedId === session.id ? "rotate-90" : ""}`}
            />
          </button>
        ))}
      </div>

      {/* Session detail */}
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <SessionDetail projectId={projectId} sessionId={selectedId} />
        ) : (
          <p className="text-sm text-zinc-400 text-center py-8">
            Select a session to view messages
          </p>
        )}
      </div>
    </div>
  );
}

function SessionDetail({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  const { data: session, isLoading } = useQuery({
    queryKey: ["session", projectId, sessionId],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/projects/{project_id}/chat/sessions/{session_id}",
        {
          params: {
            path: { project_id: projectId, session_id: sessionId },
          },
        }
      );
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading messages...</p>;
  }

  if (!session) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Clock className="w-3 h-3" />
        <span>
          {new Date(session.created_at).toLocaleString()}
        </span>
        <span className="text-zinc-300">|</span>
        <span>{session.messages.length} messages</span>
      </div>

      {session.messages.map((msg) => (
        <div key={msg.id} className="flex gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {msg.role === "user" ? (
              <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                <User className="w-3 h-3" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Bot className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-400 mb-0.5">
              {msg.role === "user" ? "User" : "Assistant"}
              <span className="ml-2 font-normal">
                {new Date(msg.created_at).toLocaleTimeString()}
              </span>
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
              {msg.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
