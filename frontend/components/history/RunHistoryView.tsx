"use client";

import React, { useState, useEffect } from "react";
import { RunSummary, RunDetail } from "@/app/types";
import { api } from "@/app/api";

interface RunHistoryViewProps {
  onSelectRun: (runId: string) => void;
}

export const RunHistoryView: React.FC<RunHistoryViewProps> = ({ onSelectRun }) => {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listRuns(undefined, 50);
      setRuns(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || "Failed to load runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleInspectRun = async (runId: string) => {
    try {
      const detail = await api.getRun(runId);
      setSelectedRunDetail(detail);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row bg-canvas text-xs font-mono">
      {/* Runs Table */}
      <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-surface-border">
        {/* Header */}
        <div className="p-3 border-b border-surface-border bg-surface-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-[10px] text-ink-dim">
              Execution History
            </span>
            <span className="text-[10px] text-ink-muted">({total} total)</span>
          </div>
          <button
            onClick={fetchRuns}
            className="px-2 py-0.5 rounded-[2px] bg-surface border border-surface-border hover:border-ink-muted text-ink"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-2 border-b border-brand-crimson/50 bg-brand-crimson/10 text-brand-crimson">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-ink-dim uppercase text-[10px] tracking-wider">
                <th className="p-2.5 font-semibold">Run ID</th>
                <th className="p-2.5 font-semibold">Workflow</th>
                <th className="p-2.5 font-semibold">Status</th>
                <th className="p-2.5 font-semibold">Duration</th>
                <th className="p-2.5 font-semibold">Timestamp</th>
                <th className="p-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {runs.map((r) => {
                const isSelected = selectedRunDetail?.id === r.id;
                let badgeClass = "text-ink-dim bg-surface";
                if (r.status === "succeeded") badgeClass = "text-brand-emerald bg-brand-emerald/10";
                if (r.status === "failed") badgeClass = "text-brand-crimson bg-brand-crimson/10";
                if (r.status === "running") badgeClass = "text-brand-amber bg-brand-amber/10 animate-pulse";

                return (
                  <tr
                    key={r.id}
                    onClick={() => handleInspectRun(r.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-surface-subtle"
                        : "hover:bg-surface-subtle/50"
                    }`}
                  >
                    <td className="p-2.5 font-semibold text-ink">
                      #{r.id.slice(0, 8)}
                    </td>
                    <td className="p-2.5 text-ink-muted truncate max-w-[180px]">
                      {r.workflow_name}
                    </td>
                    <td className="p-2.5">
                      <span className={`px-1.5 py-0.5 rounded-[2px] text-[10px] uppercase font-semibold ${badgeClass}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-ink-dim">
                      {r.duration_ms !== null ? `${r.duration_ms}ms` : "—"}
                    </td>
                    <td className="p-2.5 text-ink-dim">
                      {r.created_at.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRun(r.id);
                        }}
                        className="px-2 py-0.5 rounded-[2px] bg-surface-subtle border border-surface-border hover:border-ink-muted text-ink text-[10px]"
                      >
                        Replay DAG
                      </button>
                    </td>
                  </tr>
                );
              })}
              {runs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-dim">
                    No runs recorded yet. Execute a workflow on the Studio Canvas to generate telemetry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Column: Run Detail Inspector */}
      {selectedRunDetail && (
        <div className="w-full lg:w-96 bg-surface flex flex-col overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border">
            <div>
              <span className="font-bold text-ink">Run #{selectedRunDetail.id.slice(0, 8)}</span>
              <p className="text-[10px] text-ink-muted">{selectedRunDetail.workflow_name}</p>
            </div>
            <button
              onClick={() => setSelectedRunDetail(null)}
              className="text-ink-dim hover:text-ink"
            >
              ✕
            </button>
          </div>

          {/* Node runs audit */}
          <div className="space-y-2">
            <span className="font-bold text-[10px] uppercase text-ink-dim tracking-wider block">
              Node Execution Audit ({selectedRunDetail.node_runs.length})
            </span>
            <div className="space-y-1.5">
              {selectedRunDetail.node_runs.map((nr) => (
                <div
                  key={nr.node_id}
                  className="p-2 border border-surface-border rounded-[3px] bg-canvas space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">{nr.node_id}</span>
                    <span
                      className={`text-[9px] uppercase px-1 rounded-[2px] ${
                        nr.status === "succeeded"
                          ? "text-brand-emerald"
                          : nr.status === "failed"
                          ? "text-brand-crimson"
                          : "text-ink-dim"
                      }`}
                    >
                      {nr.status}
                    </span>
                  </div>
                  {nr.logs.length > 0 && (
                    <div className="text-[10px] text-ink-dim font-mono truncate">
                      {nr.logs[nr.logs.length - 1]}
                    </div>
                  )}
                  {nr.output_text && (
                    <div className="text-[10px] text-ink-muted line-clamp-2 bg-surface p-1 rounded-[2px]">
                      {nr.output_text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Inputs & Outputs */}
          <div className="space-y-2">
            <span className="font-bold text-[10px] uppercase text-ink-dim tracking-wider block">
              Outputs Payload
            </span>
            <pre className="p-2 bg-canvas border border-surface-border rounded-[3px] text-[10px] text-ink whitespace-pre-wrap">
              {JSON.stringify(selectedRunDetail.outputs, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
