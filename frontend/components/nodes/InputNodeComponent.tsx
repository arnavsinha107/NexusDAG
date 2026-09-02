import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { NodeStatus } from "@/app/types";

interface InputNodeData {
  label: string;
  config: { key: string };
  status?: NodeStatus;
}

export const InputNodeComponent: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as InputNodeData;
  return (
    <NodeShell
      id={props.id}
      type="input"
      label={data?.label || props.id}
      status={data?.status}
      selected={props.selected}
    >
      <div className="flex flex-col gap-1 font-mono text-[11px] text-ink-muted">
        <span className="text-[10px] uppercase text-ink-dim tracking-wider">
          Query Parameter
        </span>
        <div className="bg-surface-subtle px-2 py-1 rounded-[3px] border border-surface-border text-ink font-mono text-xs">
          inputs.{data?.config?.key || "query"}
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
