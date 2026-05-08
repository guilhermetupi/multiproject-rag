import createClient from "openapi-fetch";
import type { paths } from "@multiproject-rag/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ADMIN_TOKEN =
  process.env.NEXT_PUBLIC_ADMIN_TOKEN || "dev-admin-token";

export const api = createClient<paths>({
  baseUrl: API_BASE,
  headers: {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  },
});

export async function apiHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json() as Promise<{
    status: string;
    database: string;
    ollama: string;
  }>;
}
