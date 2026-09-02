import React from "react";
import { NodeStatus, NodeType } from "@/app/types";

interface NodeShellProps {
  id: string;
  type: NodeType;
  label: string;
  status?: NodeStatus;
  selected?: boolean;
  children: React.ReactNode;
}

const TYPE_TAGS: Record<NodeType, { tag: string; label: string }> = {
  input: { tag: "IN", label: "Input Parameter" },
  vector_retriever: { tag: "VEC", label: "pgvector Retriever" },
  semantic_router: { tag: "RT", label: "Semantic Router" },
  agent: { tag: "LLM", label: "Agent Executor" },
  transformer: { tag: "TF", label: "Data Transformer" },
  output: { tag: "OUT", label: "Streamed Output" },
};

export const NodeShell: React.FC<NodeShellProps> = ({
  id,
  type,
  label,
  status = "pending",
  selected = false,
  children,
}) => {
  const meta = TYPE_TAGS[type] || { tag: "ND", label: type };

  let statusBorder = "border-surface-border";
  let statusBadge = "text-ink-dim bg-surface";

  if (status === "running") {
    statusBorder = "border-brand-amber ring-1 ring-brand-amber/30";
    statusBadge = "text-brand-amber bg-brand-amber/10 animate-pulse";
  } else if (status === "succeeded") {
    statusBorder = "border-brand-emerald/70";
    statusBadge = "text-brand-emerald bg-brand-emerald/10";
  } else if (status === "failed") {
    statusBorder = "border-brand-crimson";
    statusBadge = "text-brand-crimson bg-brand-crimson/10";
  } else if (status === "skipped") {
    statusBorder = "border-surface-border/40 border-dashed opacity-50";
  }

  const selectionBorder = selected ? "border-ink-muted ring-1 ring-ink-muted/40" : "";

  return (
    <div
      className={`min-w-[240px] max-w-[280px] bg-surface rounded-[4px] border ${statusBorder} ${selectionBorder} transition-all duration-150 select-none`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border bg-surface-subtle rounded-t-[3px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[10px] uppercase font-bold tracking-wider px-1 py-0.5 rounded-[2px] bg-surface border border-surface-border text-ink-muted">
            {meta.tag}
          </span>
          <span className="font-mono text-xs font-semibold text-ink truncate">
            {label || id}
          </span>
        </div>
        <span
          className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] font-semibold ${statusBadge}`}
        >
          {status}
        </span>
      </div>

      {/* Node Body */}
      <div className="p-3 space-y-2 text-xs">{children}</div>
    </div>
  );
};
