import {
  Collection,
  DAGGraph,
  DocumentItem,
  EngineMeta,
  QueryMatch,
  RunDetail,
  RunSummary,
  Stats,
  ValidationReport,
  WorkflowDetail,
  WorkflowSummary,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) {
        errMessage = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      } else if (body.message) {
        errMessage = body.message;
      }
    } catch {
      // Keep status text
    }
    throw new Error(errMessage);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Workflows
  listWorkflows: () => request<WorkflowSummary[]>("/workflows"),
  getWorkflow: (id: string) => request<WorkflowDetail>(`/workflows/${id}`),
  createWorkflow: (data: { name: string; description?: string; graph?: DAGGraph }) =>
    request<WorkflowDetail>("/workflows", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWorkflow: (
    id: string,
    data: { name?: string; description?: string; graph?: DAGGraph }
  ) =>
    request<WorkflowDetail>(`/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteWorkflow: (id: string) =>
    request<void>(`/workflows/${id}`, { method: "DELETE" }),
  validateWorkflow: (id: string) =>
    request<ValidationReport>(`/workflows/${id}/validate`, { method: "POST" }),
  startRun: (workflowId: string, inputs: Record<string, string>) =>
    request<RunSummary>(`/workflows/${workflowId}/runs`, {
      method: "POST",
      body: JSON.stringify({ inputs }),
    }),

  // Runs
  listRuns: (workflowId?: string, limit = 30) => {
    const q = new URLSearchParams({ limit: limit.toString() });
    if (workflowId) q.append("workflow_id", workflowId);
    return request<{ items: RunSummary[]; total: number }>(`/runs?${q.toString()}`);
  },
  getRun: (id: string) => request<RunDetail>(`/runs/${id}`),
  cancelRun: (id: string) => request<RunSummary>(`/runs/${id}/cancel`, { method: "POST" }),

  // Collections
  listCollections: () => request<Collection[]>("/collections"),
  getCollection: (id: string) => request<Collection>(`/collections/${id}`),
  createCollection: (data: { name: string; description?: string }) =>
    request<Collection>("/collections", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteCollection: (id: string) =>
    request<void>(`/collections/${id}`, { method: "DELETE" }),
  listDocuments: (collectionId: string) =>
    request<DocumentItem[]>(`/collections/${collectionId}/documents`),
  addDocumentText: (collectionId: string, data: { title: string; text: string }) =>
    request<DocumentItem>(`/collections/${collectionId}/documents`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  uploadDocumentFile: async (collectionId: string, file: File, title?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (title) formData.append("title", title);

    const res = await fetch(`${API_BASE}/collections/${collectionId}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Upload failed");
    }
    return res.json() as Promise<DocumentItem>;
  },
  queryCollection: (collectionId: string, query: string, topK = 4) =>
    request<QueryMatch[]>(`/collections/${collectionId}/query`, {
      method: "POST",
      body: JSON.stringify({ query, top_k: topK }),
    }),

  // Telemetry & Meta
  getStats: () => request<Stats>("/stats"),
  getMeta: () => request<EngineMeta>("/meta"),
};
