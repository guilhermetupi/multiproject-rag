const BASE = '/api';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
}

export interface FAQ {
  id: string;
  project_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSource {
  document_id: string;
  chunk_id: string;
  title: string | null;
  score: number | null;
}

export interface ChatResponse {
  answer: string;
  session_id: string;
  sources: ChatSource[];
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
  return res.json();
}

export async function fetchFAQs(projectId: string): Promise<FAQ[]> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/faqs`);
  if (!res.ok) throw new Error(`Failed to fetch FAQs: ${res.status}`);
  return res.json();
}

export async function sendChatMessage(
  projectId: string,
  message: string,
  sessionId?: string,
): Promise<ChatResponse> {
  const res = await fetch(
    `${BASE}/projects/${encodeURIComponent(projectId)}/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: sessionId ?? null }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? `Chat failed: ${res.status}`);
  }
  return res.json();
}

export type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; session_id: string; sources: ChatSource[] }
  | { type: 'error'; message: string };

export async function streamChatMessage(
  projectId: string,
  message: string,
  onEvent: (event: StreamEvent) => void,
  sessionId?: string,
): Promise<void> {
  const res = await fetch(
    `${BASE}/projects/${encodeURIComponent(projectId)}/chat/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: sessionId ?? null }),
    },
  );

  if (!res.ok) throw new Error(`Stream failed: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        onEvent(data as StreamEvent);
      } catch {
        // skip malformed lines
      }
    }
  }
}
