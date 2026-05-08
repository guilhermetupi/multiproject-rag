"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api-client";
import {
  ArrowLeft,
  FileText,
  MessageCircle,
  History,
  HelpCircle,
  Settings,
} from "lucide-react";
import { DocumentsTab } from "@/components/documents-tab";
import { ChatTab } from "@/components/chat-tab";
import { SessionsTab } from "@/components/sessions-tab";
import { FAQsTab } from "@/components/faqs-tab";

const TABS = [
  { key: "documents", label: "Documents", icon: FileText },
  { key: "chat", label: "Chat", icon: MessageCircle },
  { key: "faqs", label: "FAQ", icon: HelpCircle },
  { key: "sessions", label: "Sessions", icon: History },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

function ProjectTabs({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") || "documents";

  return (
    <>
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() =>
                router.replace(`/projects/${projectId}?tab=${tab.key}`)
              }
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-zinc-900 dark:border-white text-zinc-900 dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "documents" && <DocumentsTab projectId={projectId} />}
      {activeTab === "chat" && <ChatTab projectId={projectId} />}
      {activeTab === "faqs" && <FAQsTab projectId={projectId} />}
      {activeTab === "sessions" && <SessionsTab projectId={projectId} />}
      {activeTab === "settings" && <SettingsTab projectId={projectId} />}
    </>
  );
}

const PROVIDERS = [
  { value: "", label: "Ollama (default)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "deepseek", label: "DeepSeek" },
] as const;

function SettingsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/projects/{project_id}",
        { params: { path: { project_id: projectId } } }
      );
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [provider, setProvider] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (project && !initialized) {
    setName(project.name);
    setDescription(project.description || "");
    setSystemPrompt(project.system_prompt || "");
    setProvider(project.provider || "");
    setModelName(project.model_name || "");
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | null> = {
        name: name.trim() || null,
        description: description.trim() || null,
        system_prompt: systemPrompt.trim() || null,
        provider: provider || null,
        model_name: modelName || null,
        api_key: apiKey || null,
      };
      const { data, error } = await api.PATCH(
        "/api/projects/{project_id}",
        {
          params: { path: { project_id: projectId } },
          body: body as never,
        }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1.5">Project Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">
          Custom System Prompt
        </label>
        <p className="text-xs text-zinc-500 mb-1.5">
          Override the default system prompt. Leave empty to use the default.
          Use this to align the model with internal terminology or tone.
        </p>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          placeholder="You are a helpful assistant..."
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm resize-y font-mono"
        />
        <p className="text-xs text-zinc-400 mt-1">
          The retrieved context chunks will be appended to your prompt automatically.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">LLM Provider</label>
        <p className="text-xs text-zinc-500 mb-1.5">
          Leave empty to use the local Ollama instance.
        </p>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Model</label>
        <p className="text-xs text-zinc-500 mb-1.5">
          Model identifier (e.g. gpt-4o, claude-opus-4-7, gemini-2.5-flash, deepseek-chat).
          Leave empty to use the default from config.
        </p>
        <input
          type="text"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="llama3.1:8b"
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">API Key</label>
        <p className="text-xs text-zinc-500 mb-1.5">
          Required for cloud providers. The key is never returned by the API — you must re-enter it on each save. Not needed for Ollama.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm font-mono"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !name.trim()}
          className="px-4 py-1.5 text-sm rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {updateMutation.isSuccess && (
        <p className="text-sm text-green-600">Settings saved successfully.</p>
      )}
      {updateMutation.error && (
        <p className="text-sm text-red-500">
          {(updateMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/projects/{project_id}",
        { params: { path: { project_id: id } } }
      );
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-zinc-500">Project not found</p>
        <button
          onClick={() => router.push("/projects")}
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300 underline"
        >
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/projects")}
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-sm text-zinc-500 mt-0.5">
              {project.description}
            </p>
          )}
        </div>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-32">
            <p className="text-zinc-400 text-sm">Loading tabs...</p>
          </div>
        }
      >
        <ProjectTabs projectId={id} />
      </Suspense>
    </div>
  );
}
