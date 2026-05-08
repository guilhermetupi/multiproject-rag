"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/api-client";
import { Plus, Trash2 } from "lucide-react";
import type { components } from "@multiproject-rag/contracts";

type ProjectResponse = components["schemas"]["ProjectResponse"];

const PROVIDERS = [
  { value: "", label: "Ollama (default)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "deepseek", label: "DeepSeek" },
] as const;

export default function ProjectsPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [provider, setProvider] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/projects");
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/projects", {
        body: {
          name,
          description: description || null,
          system_prompt: systemPrompt || null,
          provider: provider || null,
          model_name: modelName || null,
          api_key: apiKey || null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setName("");
      setDescription("");
      setSystemPrompt("");
      setProvider("");
      setModelName("");
      setApiKey("");
      setShowForm(false);
      if (project) router.push(`/projects/${project.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/projects/{project_id}", {
        params: { path: { project_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="mb-6 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3"
        >
          <input
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
          />
          <textarea
            placeholder="Custom system prompt (optional)"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm resize-y font-mono"
          />
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
          <input
            type="text"
            placeholder="Model name (e.g. gpt-4o, claude-opus-4-7, gemini-2.5-flash)"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
          />
          <input
            type="password"
            placeholder="API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              className="px-4 py-1.5 text-sm rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
          {createMutation.error && (
            <p className="text-sm text-red-500">
              {(createMutation.error as Error).message}
            </p>
          )}
        </form>
      )}

      {isLoading && (
        <p className="text-sm text-zinc-500">Loading projects...</p>
      )}

      <div className="space-y-2">
        {projects?.map((p) => (
          <div
            key={p.id}
            onClick={() => router.push(`/projects/${p.id}`)}
            className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
          >
            <div>
              <h3 className="font-medium text-sm">{p.name}</h3>
              {p.description && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {p.description}
                </p>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this project?")) {
                  deleteMutation.mutate(p.id);
                }
              }}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-zinc-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {projects?.length === 0 && !isLoading && (
          <p className="text-sm text-zinc-400 text-center py-8">
            No projects yet. Create your first project above.
          </p>
        )}
      </div>
    </div>
  );
}
