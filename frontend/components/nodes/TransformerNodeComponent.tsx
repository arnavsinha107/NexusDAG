import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { NodeStatus } from "@/app/types";

interface TransformerNodeData {
  label: string;
  config: {
    operation: "template" | "truncate" | "extract_json";
    template: string;
    max_chars: number;
    json_key: string;
  };
  status?: NodeStatus;
}

export const TransformerNodeComponent: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as TransformerNodeData;
  return (
    <NodeShell
      id={props.id}
      type="transformer"
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
          <span>Op</span>
          <span className="text-ink font-semibold uppercase">
            {data?.config?.operation || "template"}
          </span>
        </div>
        {data?.config?.operation === "extract_json" && (
          <div className="flex justify-between text-ink-muted">
            <span>Key</span>
            <span className="text-ink truncate">{data?.config?.json_key || "."}</span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-ink-muted hover:!bg-brand-amber !border-surface"
      />
    </NodeShell>
  );
};
