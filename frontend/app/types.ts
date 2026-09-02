export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type NodeStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface NodePosition {
  x: number;
  y: number;
}

export interface RouteConfig {
  key: string;
  utterances: string[];
}

export interface NodeConfigMap {
  input: { key: string };
  vector_retriever: {
    collection_id: string | null;
    top_k: number;
    min_score: number;
    query_template: string;
  };
  semantic_router: {
    threshold: number;
    input_template: string;
    routes: RouteConfig[];
  };
  agent: {
    system_prompt: string;
    prompt_template: string;
    model: string | null;
    temperature: number;
    max_tokens: number;
  };
  transformer: {
    operation: "template" | "truncate" | "extract_json";
    template: string;
    max_chars: number;
    json_key: string;
  };
  output: {
    key: string;
    template: string;
  };
}

export type NodeType = keyof NodeConfigMap;

export interface DAGNode {
  id: string;
  type: NodeType;
  label: string;
  position: NodePosition;
  config: NodeConfigMap[NodeType];
}

export interface DAGEdge {
  id: string;
  source: string;
  target: string;
  source_handle: string | null;
}

export interface DAGGraph {
  nodes: DAGNode[];
  edges: DAGEdge[];
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  node_count: number;
  created_at: string;
  updated_at: string;
  last_run_status: RunStatus | null;
  last_run_at: string | null;
}

export interface WorkflowDetail {
  id: string;
  name: string;
  description: string;
  graph: DAGGraph;
  created_at: string;
  updated_at: string;
}

export interface NodeRunRead {
  node_id: string;
  node_type: string;
  status: NodeStatus;
  started_at: string | null;
  finished_at: string | null;
  output_text: string;
  output_data: Record<string, unknown>;
  error: string | null;
  logs: string[];
}

export interface RunSummary {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: RunStatus;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface RunDetail extends RunSummary {
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  graph: DAGGraph;
  node_runs: NodeRunRead[];
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  created_at: string;
  document_count: number;
  chunk_count: number;
}

export interface DocumentItem {
  id: string;
  collection_id: string;
  title: string;
  source: string;
  char_count: number;
  chunk_count: number;
  created_at: string;
}

export interface QueryMatch {
  chunk_id: number;
  document_id: string;
  document_title: string;
  content: string;
  score: number;
}

export interface DailyRuns {
  date: string;
  succeeded: number;
  failed: number;
}

export interface Stats {
  runs_24h: number;
  success_rate_24h: number | null;
  median_duration_ms_24h: number | null;
  active_runs: number;
  workflows: number;
  collections: number;
  chunks: number;
  daily: DailyRuns[];
}

export interface EngineMeta {
  version: string;
  environment: string;
  llm_provider: string;
  llm_model: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_dim: number;
}

export interface GraphIssue {
  message: string;
  node_id: string | null;
  edge_id: string | null;
}

export interface ValidationReport {
  valid: boolean;
  issues: GraphIssue[];
}

export interface RunEvent {
  seq: number;
  type: string;
  run_id: string;
  node_id: string | null;
  ts: string;
  data: {
    node_type?: string;
    message?: string;
    token?: string;
    text?: string;
    data?: Record<string, unknown>;
    route?: string | null;
    duration_ms?: number;
    error?: string;
    status?: RunStatus;
    outputs?: Record<string, string>;
    nodes?: Array<{
      node_id: string;
      status: NodeStatus;
      output_text: string;
      output_data: Record<string, unknown>;
      error: string | null;
      logs: string[];
    }>;
  };
}
