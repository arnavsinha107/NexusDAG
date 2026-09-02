import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { NodeStatus } from "@/app/types";

interface RetrieverNodeData {
  label: string;
  config: {
    collection_id: string | null;
    top_k: number;
    min_score: number;
    query_template: string;
  };
  status?: NodeStatus;
}

export const RetrieverNodeComponent: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as RetrieverNodeData;
  return (
    <NodeShell
      id={props.id}
      type="vector_retriever"
      label={data?.label || props.id}
      status={data?.status}
      selected={props.selected}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-ink-muted hover:!bg-brand-amber !border-surface"
      />

      <div className="space-y-1.5 font-mono text-[11px]">
        <div className="flex justify-between text-ink-muted">
          <span>Index</span>
          <span className="text-ink">HNSW (Cosine)</span>
        </div>
        <div className="flex justify-between text-ink-muted">
          <span>Top-K Chunks</span>
          <span className="text-ink font-semibold">{data?.config?.top_k ?? 4}</span>
        </div>
        <div className="flex justify-between text-ink-muted">
          <span>Min Similarity</span>
          <span className="text-ink font-semibold">{data?.config?.min_score ?? 0.0}</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-ink-muted hover:!bg-brand-amber !border-surface"
      />
    </NodeShell>
  );
};
