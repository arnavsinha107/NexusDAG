import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { NodeStatus, RouteConfig } from "@/app/types";

interface RouterNodeData {
  label: string;
  config: {
    threshold: number;
    input_template: string;
    routes: RouteConfig[];
  };
  status?: NodeStatus;
  selectedRoute?: string;
}

export const RouterNodeComponent: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as RouterNodeData;
  const routes = data?.config?.routes || [];
  const allHandles = [...routes.map((r) => r.key), "fallback"];

  return (
    <NodeShell
      id={props.id}
      type="semantic_router"
      label={data?.label || props.id}
      status={data?.status}
      selected={props.selected}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-ink-muted hover:!bg-brand-amber !border-surface"
      />

      <div className="space-y-2">
        <div className="flex justify-between font-mono text-[10px] text-ink-muted">
          <span>Threshold</span>
          <span className="text-ink font-semibold">
            {data?.config?.threshold ?? 0.35}
          </span>
        </div>

        <div className="space-y-1.5 pt-1 border-t border-surface-border">
          <span className="text-[10px] uppercase font-mono text-ink-dim tracking-wider block">
            Condition Branches
          </span>
          {allHandles.map((handleKey, idx) => {
            const isChosen = data?.selectedRoute === handleKey;
            return (
              <div
                key={handleKey}
                className={`relative flex items-center justify-between px-2 py-1 rounded-[2px] font-mono text-[11px] border ${
                  isChosen
                    ? "bg-brand-amber/10 border-brand-amber text-brand-amber font-semibold"
                    : "bg-surface-subtle border-surface-border text-ink-muted"
                }`}
              >
                <span>{handleKey}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handleKey}
                  style={{
                    top: `${14 + idx * 24}px`,
                    right: "-17px",
                  }}
                  className={`!w-2 !h-2 !border-surface ${
                    isChosen ? "!bg-brand-amber" : "!bg-ink-muted hover:!bg-brand-amber"
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </NodeShell>
  );
};
