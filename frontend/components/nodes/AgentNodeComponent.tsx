import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { NodeStatus } from "@/app/types";

interface AgentNodeData {
  label: string;
  config: {
    system_prompt: string;
    prompt_template: string;
    model: string | null;
    temperature: number;
    max_tokens: number;
  };
  status?: NodeStatus;
  liveToken?: string;
}

export const AgentNodeComponent: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as AgentNodeData;
  return (
    <NodeShell
      id={props.id}
      type="agent"
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
          <span>Model</span>
          <span className="text-ink font-semibold">
            {data?.config?.model || "gpt-4o-mini"}
          </span>
        </div>
        <div className="flex justify-between text-ink-muted">
          <span>Temp / Tokens</span>
          <span className="text-ink">
            {data?.config?.temperature ?? 0.2} / {data?.config?.max_tokens ?? 512}
          </span>
        </div>
        {data?.status === "running" && data?.liveToken && (
          <div className="mt-2 p-1.5 bg-surface-subtle border border-brand-amber/30 rounded-[2px] text-ink font-mono text-[10px] truncate animate-pulse">
            {data.liveToken}
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
