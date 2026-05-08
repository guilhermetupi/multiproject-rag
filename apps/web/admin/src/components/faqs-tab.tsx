"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api-client";
import { Plus, Trash2, Edit3, X, Check } from "lucide-react";
import type { components } from "@multiproject-rag/contracts";

type FAQResponse = components["schemas"]["FAQResponse"];

export function FAQsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const { data: faqs, isLoading } = useQuery({
    queryKey: ["faqs", projectId],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/projects/{project_id}/faqs",
        { params: { path: { project_id: projectId } } }
      );
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        "/api/projects/{project_id}/faqs",
        {
          params: { path: { project_id: projectId } },
          body: { question, answer },
        }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs", projectId] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      faqId,
      question: q,
      answer: a,
    }: {
      faqId: string;
      question?: string;
      answer?: string;
    }) => {
      const { data, error } = await api.PATCH(
        "/api/projects/{project_id}/faqs/{faq_id}",
        {
          params: { path: { project_id: projectId, faq_id: faqId } },
          body: {
            question: q ?? null,
            answer: a ?? null,
          } as never,
        }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs", projectId] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (faqId: string) => {
      const { error } = await api.DELETE(
        "/api/projects/{project_id}/faqs/{faq_id}",
        { params: { path: { project_id: projectId, faq_id: faqId } } }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs", projectId] });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setQuestion("");
    setAnswer("");
  }

  function startEdit(faq: FAQResponse) {
    setEditingId(faq.id);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setShowForm(true);
  }

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-zinc-500">
          {faqs?.length || 0} FAQ{faqs?.length !== 1 ? "s" : ""}
        </h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add FAQ
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!question.trim() || !answer.trim()) return;
            if (editingId) {
              updateMutation.mutate({
                faqId: editingId,
                question: question.trim(),
                answer: answer.trim(),
              });
            } else {
              createMutation.mutate();
            }
          }}
          className="mb-6 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3"
        >
          <input
            type="text"
            placeholder="Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
          />
          <textarea
            placeholder="Answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            required
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm resize-y"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !question.trim() || !answer.trim()}
              className="px-4 py-1.5 text-sm rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black disabled:opacity-50"
            >
              {isPending
                ? "Saving..."
                : editingId
                  ? "Update"
                  : "Create"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && (
        <p className="text-sm text-zinc-500 py-4">Loading FAQs...</p>
      )}

      <div className="space-y-3">
        {faqs?.map((faq) => (
          <div
            key={faq.id}
            className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium">{faq.question}</h3>
                <p className="text-sm text-zinc-500 mt-1.5 whitespace-pre-wrap">
                  {faq.answer}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => startEdit(faq)}
                  disabled={isPending}
                  className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this FAQ?")) {
                      deleteMutation.mutate(faq.id);
                    }
                  }}
                  disabled={isPending}
                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {faqs?.length === 0 && !isLoading && (
          <p className="text-sm text-zinc-400 text-center py-8">
            No FAQs yet. Add frequently asked questions to help the RAG system
            answer common queries.
          </p>
        )}
      </div>
    </div>
  );
}
