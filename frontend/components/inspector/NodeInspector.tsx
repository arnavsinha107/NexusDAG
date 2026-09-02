"use client";

import React, { useState, useEffect } from "react";
import { DAGNode, Collection, RouteConfig } from "@/app/types";

interface NodeInspectorProps {
  node: DAGNode | null;
  collections: Collection[];
  onUpdateNode: (updated: DAGNode) => void;
  onDeleteNode: (id: string) => void;
  onClose: () => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  node,
  collections,
  onUpdateNode,
  onDeleteNode,
  onClose,
}) => {
  const [localNode, setLocalNode] = useState<DAGNode | null>(node);

  useEffect(() => {
    setLocalNode(node);
  }, [node]);

  if (!localNode) return null;

  const updateConfig = (patch: Record<string, any>) => {
    const updated: DAGNode = {
      ...localNode,
      config: {
        ...localNode.config,
        ...patch,
      },
    };
    setLocalNode(updated);
    onUpdateNode(updated);
  };

  const updateLabel = (label: string) => {
    const updated: DAGNode = { ...localNode, label };
    setLocalNode(updated);
    onUpdateNode(updated);
  };

  return (
    <div className="w-80 h-full bg-surface border-l border-surface-border flex flex-col text-xs font-mono select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border bg-surface-subtle">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] uppercase font-bold text-ink-dim tracking-wider">
            Inspector
          </span>
          <span className="text-ink font-semibold truncate">
            {localNode.id}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-ink-muted hover:text-ink px-1.5 py-0.5 rounded-[2px]"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
            Display Label
          </label>
          <input
            type="text"
            value={localNode.label}
            onChange={(e) => updateLabel(e.target.value)}
            className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink focus:outline-none focus:border-ink-muted"
          />
        </div>

        {/* Node Type Specific Fields */}
        {localNode.type === "input" && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
              Parameter Key
            </label>
            <input
              type="text"
              value={(localNode.config as any).key || ""}
              onChange={(e) => updateConfig({ key: e.target.value })}
              className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink focus:outline-none focus:border-ink-muted"
              placeholder="query"
            />
          </div>
        )}

        {localNode.type === "vector_retriever" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                Target Collection
              </label>
              <select
                value={(localNode.config as any).collection_id || ""}
                onChange={(e) =>
                  updateConfig({
                    collection_id: e.target.value ? e.target.value : null,
                  })
                }
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink focus:outline-none focus:border-ink-muted"
              >
                <option value="">-- Select Knowledge Base --</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name} ({col.chunk_count} chunks)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                  Top-K
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={(localNode.config as any).top_k || 4}
                  onChange={(e) =>
                    updateConfig({ top_k: parseInt(e.target.value) || 4 })
                  }
                  className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                  Min Score
                </label>
                <input
                  type="number"
                  step={0.05}
                  min={-1}
                  max={1}
                  value={(localNode.config as any).min_score ?? 0.0}
                  onChange={(e) =>
                    updateConfig({ min_score: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                Query Template
              </label>
              <textarea
                rows={2}
                value={(localNode.config as any).query_template || ""}
                onChange={(e) => updateConfig({ query_template: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink focus:outline-none focus:border-ink-muted"
                placeholder="{{upstream}}"
              />
            </div>
          </div>
        )}

        {localNode.type === "semantic_router" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                  Similarity Threshold
                </label>
                <span className="text-ink">
                  {(localNode.config as any).threshold ?? 0.35}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={(localNode.config as any).threshold ?? 0.35}
                onChange={(e) =>
                  updateConfig({ threshold: parseFloat(e.target.value) })
                }
                className="w-full accent-brand-amber cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                Input Template
              </label>
              <input
                type="text"
                value={(localNode.config as any).input_template || ""}
                onChange={(e) => updateConfig({ input_template: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                placeholder="{{inputs.query}}"
              />
            </div>

            {/* Routes */}
            <div className="space-y-2 pt-2 border-t border-surface-border">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                  Configured Routes
                </label>
                <button
                  onClick={() => {
                    const currentRoutes = (localNode.config as any).routes || [];
                    const newRoute: RouteConfig = {
                      key: `branch_${currentRoutes.length + 1}`,
                      utterances: ["sample utterance"],
                    };
                    updateConfig({ routes: [...currentRoutes, newRoute] });
                  }}
                  className="text-[10px] text-brand-amber hover:underline"
                >
                  + Add Route
                </button>
              </div>

              {((localNode.config as any).routes || []).map(
                (route: RouteConfig, idx: number) => (
                  <div
                    key={idx}
                    className="p-2 border border-surface-border rounded-[3px] bg-canvas space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={route.key}
                        onChange={(e) => {
                          const updated = [...(localNode.config as any).routes];
                          updated[idx] = { ...updated[idx], key: e.target.value };
                          updateConfig({ routes: updated });
                        }}
                        className="bg-surface px-1.5 py-0.5 rounded-[2px] border border-surface-border text-ink text-xs font-semibold w-28"
                      />
                      <button
                        onClick={() => {
                          const updated = (
                            localNode.config as any
                          ).routes.filter((_: any, i: number) => i !== idx);
                          updateConfig({ routes: updated });
                        }}
                        className="text-ink-dim hover:text-brand-crimson text-[10px]"
                      >
                        Delete
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={route.utterances.join("\n")}
                      onChange={(e) => {
                        const lines = e.target.value.split("\n");
                        const updated = [...(localNode.config as any).routes];
                        updated[idx] = { ...updated[idx], utterances: lines };
                        updateConfig({ routes: updated });
                      }}
                      className="w-full bg-surface-subtle border border-surface-border rounded-[2px] p-1 text-[10px] text-ink"
                      placeholder="One utterance per line"
                    />
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {localNode.type === "agent" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                LLM Model
              </label>
              <input
                type="text"
                value={(localNode.config as any).model || "gpt-4o-mini"}
                onChange={(e) => updateConfig({ model: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                  Temp ({ (localNode.config as any).temperature ?? 0.2 })
                </label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  value={(localNode.config as any).temperature ?? 0.2}
                  onChange={(e) =>
                    updateConfig({
                      temperature: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                  Max Tokens
                </label>
                <input
                  type="number"
                  step={64}
                  min={16}
                  max={4096}
                  value={(localNode.config as any).max_tokens ?? 512}
                  onChange={(e) =>
                    updateConfig({
                      max_tokens: parseInt(e.target.value) || 512,
                    })
                  }
                  className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                System Prompt
              </label>
              <textarea
                rows={3}
                value={(localNode.config as any).system_prompt || ""}
                onChange={(e) => updateConfig({ system_prompt: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink focus:outline-none focus:border-ink-muted text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                Prompt Template
              </label>
              <textarea
                rows={4}
                value={(localNode.config as any).prompt_template || ""}
                onChange={(e) => updateConfig({ prompt_template: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink focus:outline-none focus:border-ink-muted text-[11px]"
              />
            </div>
          </div>
        )}

        {localNode.type === "transformer" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                Operation
              </label>
              <select
                value={(localNode.config as any).operation || "template"}
                onChange={(e) => updateConfig({ operation: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
              >
                <option value="template">Template Interpolation</option>
                <option value="truncate">Length Truncation</option>
                <option value="extract_json">JSON Key Path Extraction</option>
              </select>
            </div>

            {(localNode.config as any).operation === "extract_json" && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                  JSON Key Path
                </label>
                <input
                  type="text"
                  value={(localNode.config as any).json_key || ""}
                  onChange={(e) => updateConfig({ json_key: e.target.value })}
                  className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                  placeholder="data.items.0"
                />
              </div>
            )}

            {(localNode.config as any).operation === "truncate" && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                  Max Characters
                </label>
                <input
                  type="number"
                  value={(localNode.config as any).max_chars || 2000}
                  onChange={(e) =>
                    updateConfig({ max_chars: parseInt(e.target.value) || 2000 })
                  }
                  className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                Template
              </label>
              <textarea
                rows={3}
                value={(localNode.config as any).template || ""}
                onChange={(e) => updateConfig({ template: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
              />
            </div>
          </div>
        )}

        {localNode.type === "output" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                Output Key
              </label>
              <input
                type="text"
                value={(localNode.config as any).key || ""}
                onChange={(e) => updateConfig({ key: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                placeholder="result"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-ink-dim font-bold tracking-wider">
                Template
              </label>
              <textarea
                rows={3}
                value={(localNode.config as any).template || ""}
                onChange={(e) => updateConfig({ template: e.target.value })}
                className="w-full bg-canvas border border-surface-border rounded-[3px] px-2 py-1.5 text-ink"
                placeholder="{{upstream}}"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-surface-border bg-surface-subtle flex justify-between">
        <button
          onClick={() => onDeleteNode(localNode.id)}
          className="px-2.5 py-1 text-brand-crimson hover:bg-brand-crimson/10 border border-brand-crimson/30 rounded-[3px] transition-colors"
        >
          Delete Node
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-surface border border-surface-border text-ink rounded-[3px] hover:border-ink-muted transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
};
