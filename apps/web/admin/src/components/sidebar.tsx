"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, apiHealth } from "@/api-client";
import {
  FolderOpen,
  Plus,
  Activity,
  Database,
  Cpu,
  Layers,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/projects");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: apiHealth,
    refetchInterval: 15_000,
  });

  const projectId = pathname.match(/\/projects\/([^/]+)/)?.[1];

  return (
    <aside className="w-64 h-screen border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link href="/projects" className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          <span className="font-semibold text-sm tracking-tight">
            RAG Admin
          </span>
        </Link>
      </div>

      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-4 text-xs">
        <span
          className={`flex items-center gap-1 ${health?.database === "ok" ? "text-green-600" : "text-red-500"}`}
          title={`Database: ${health?.database || "..."}`}
        >
          <Database className="w-3 h-3" /> DB
        </span>
        <span
          className={`flex items-center gap-1 ${health?.ollama === "ok" ? "text-green-600" : "text-red-500"}`}
          title={`Ollama: ${health?.ollama || "..."}`}
        >
          <Cpu className="w-3 h-3" /> Ollama
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Projects
          </span>
          <Link
            href="/projects"
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
          </Link>
        </div>

        <nav className="space-y-0.5">
          {projects?.map((p) => {
            const isActive = projectId === p.id;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-200 dark:bg-zinc-800 font-medium"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{p.name}</span>
              </Link>
            );
          })}
          {projects?.length === 0 && (
            <p className="px-2 py-2 text-xs text-zinc-400">
              No projects yet
            </p>
          )}
        </nav>
      </div>

      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 flex items-center gap-1.5">
        <Activity className="w-3 h-3" />
        <span>{health?.status || "..."}</span>
      </div>
    </aside>
  );
}
