"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api-client";
import type { components } from "@multiproject-rag/contracts";
import {
  Upload,
  FileText,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
} from "lucide-react";

type DocumentResponse = components["schemas"]["DocumentResponse"];
type DocumentChunkResponse = components["schemas"]["DocumentChunkResponse"];

const STATUS_ICON: Record<string, React.ReactNode> = {
  uploaded: <FileText className="w-4 h-4 text-zinc-400" />,
  processing: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  processed: <CheckCircle className="w-4 h-4 text-green-500" />,
  failed: <AlertCircle className="w-4 h-4 text-red-500" />,
};

export function DocumentsTab({ projectId }: { projectId: string }) {
  const [chunksDocId, setChunksDocId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/projects/{project_id}/documents",
        { params: { path: { project_id: projectId } } }
      );
      if (error) throw error;
      return data || [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { data, error } = await api.POST(
        "/api/projects/{project_id}/documents",
        {
          params: { path: { project_id: projectId } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          body: { file: file as any },
          bodySerializer: (body: unknown) => {
            const form = new FormData();
            form.append("file", (body as { file: File }).file);
            return form;
          },
        }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await api.DELETE(
        "/api/projects/{project_id}/documents/{document_id}",
        {
          params: {
            path: { project_id: projectId, document_id: documentId },
          },
        }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { data, error } = await api.POST(
        "/api/projects/{project_id}/documents/{document_id}/ingest",
        {
          params: {
            path: { project_id: projectId, document_id: documentId },
          },
        }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
  });

  return (
    <div>
      {/* Upload area */}
      <label className="flex items-center justify-center gap-2 p-6 mb-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors text-sm text-zinc-500">
        <Upload className="w-4 h-4" />
        <span>Drop files here or click to upload (PDF, TXT, MD)</span>
        <input
          type="file"
          accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            e.target.value = "";
          }}
          disabled={uploadMutation.isPending}
        />
      </label>

      {uploadMutation.isPending && (
        <p className="text-sm text-zinc-500 mb-4">Uploading...</p>
      )}
      {uploadMutation.error && (
        <p className="text-sm text-red-500 mb-4">
          {(uploadMutation.error as Error).message}
        </p>
      )}

      {/* Document list */}
      {isLoading && (
        <p className="text-sm text-zinc-500">Loading documents...</p>
      )}

      <div className="space-y-2">
        {documents?.map((doc) => (
          <DocCard
            key={doc.id}
            doc={doc}
            expanded={chunksDocId === doc.id}
            onToggleChunks={() =>
              setChunksDocId(chunksDocId === doc.id ? null : doc.id)
            }
            onDelete={() => {
              if (confirm("Delete this document?")) {
                deleteMutation.mutate(doc.id);
              }
            }}
            onIngest={() => ingestMutation.mutate(doc.id)}
            isIngesting={ingestMutation.isPending}
            ingestTarget={
              ingestMutation.variables ?? undefined
            }
          />
        ))}

        {documents?.length === 0 && !isLoading && (
          <p className="text-sm text-zinc-400 text-center py-8">
            No documents yet. Upload one above.
          </p>
        )}
      </div>
    </div>
  );
}

function DocCard({
  doc,
  expanded,
  onToggleChunks,
  onDelete,
  onIngest,
  isIngesting,
  ingestTarget,
}: {
  doc: DocumentResponse;
  expanded: boolean;
  onToggleChunks: () => void;
  onDelete: () => void;
  onIngest: () => void;
  isIngesting: boolean;
  ingestTarget?: string;
}) {
  const isThisIngesting = isIngesting && ingestTarget === doc.id;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0">
          {STATUS_ICON[doc.status] || STATUS_ICON.uploaded}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{doc.filename}</p>
            <p className="text-xs text-zinc-400">
              {doc.status}
              {doc.error_message && (
                <span className="text-red-500 ml-2">{doc.error_message}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {doc.status === "processed" && (
            <button
              onClick={onToggleChunks}
              className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
              title="View chunks"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}

          <button
            onClick={onIngest}
            disabled={isThisIngesting || doc.status === "processing"}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 disabled:opacity-30"
            title="Ingest document"
          >
            {isThisIngesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-zinc-400 hover:text-red-500"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && <ChunkList projectId={doc.project_id} documentId={doc.id} />}
    </div>
  );
}

function ChunkList({
  projectId,
  documentId,
}: {
  projectId: string;
  documentId: string;
}) {
  const { data: chunks, isLoading } = useQuery({
    queryKey: ["chunks", projectId, documentId],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/projects/{project_id}/documents/{document_id}/chunks",
        {
          params: {
            path: { project_id: projectId, document_id: documentId },
          },
        }
      );
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 text-sm text-zinc-500">
        Loading chunks...
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
      {chunks?.map((chunk) => (
        <div key={chunk.id} className="p-3 text-xs">
          <div className="flex items-center gap-2 mb-1 text-zinc-400">
            <span className="font-mono">#{chunk.chunk_index}</span>
            {chunk.page_number && <span>Page {chunk.page_number}</span>}
            {chunk.section_title && <span>{chunk.section_title}</span>}
          </div>
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-4">
            {chunk.content}
          </p>
        </div>
      ))}
      {chunks?.length === 0 && (
        <p className="p-3 text-xs text-zinc-400">No chunks found</p>
      )}
    </div>
  );
}
