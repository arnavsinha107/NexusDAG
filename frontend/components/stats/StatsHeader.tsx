"use client";

import React from "react";
import { Stats, EngineMeta } from "@/app/types";

interface StatsHeaderProps {
  stats: Stats | null;
  meta: EngineMeta | null;
  connected: boolean;
}

export const StatsHeader: React.FC<StatsHeaderProps> = ({
  stats,
  meta,
  connected,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-surface border-b border-surface-border text-xs font-mono select-none">
      {/* Backend Engine Health Indicator */}
      <div className="flex items-center gap-2 pr-3 border-r border-surface-border">
        <span
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-brand-emerald" : "bg-brand-crimson animate-pulse"
          }`}
        />
        <span className="text-[11px] font-semibold text-ink">
          {connected ? "ENGINE ONLINE" : "DISCONNECTED"}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-ink-muted text-[11px]">
        <div>
          <span className="text-ink-dim">Active Runs: </span>
          <span className="text-ink font-semibold">{stats?.active_runs ?? 0}</span>
        </div>
        <div>
          <span className="text-ink-dim">24h Runs: </span>
          <span className="text-ink font-semibold">{stats?.runs_24h ?? 0}</span>
        </div>
        <div>
          <span className="text-ink-dim">Success: </span>
          <span className="text-ink font-semibold">
            {stats?.success_rate_24h !== null && stats?.success_rate_24h !== undefined
              ? `${(stats.success_rate_24h * 100).toFixed(0)}%`
              : "—"}
          </span>
        </div>
        <div>
          <span className="text-ink-dim">Median Latency: </span>
          <span className="text-ink font-semibold">
            {stats?.median_duration_ms_24h !== null && stats?.median_duration_ms_24h !== undefined
              ? `${stats.median_duration_ms_24h}ms`
              : "—"}
          </span>
        </div>
        <div>
          <span className="text-ink-dim">pgvector Chunks: </span>
          <span className="text-ink font-semibold">{stats?.chunks ?? 0}</span>
        </div>
      </div>

      {/* Right side engine metadata badge */}
      {meta && (
        <div className="ml-auto hidden xl:flex items-center gap-2 text-[10px] text-ink-dim border-l border-surface-border pl-3">
          <span>{meta.embedding_model.split("/").pop()} ({meta.embedding_dim}d)</span>
          <span>•</span>
          <span className="text-brand-amber font-semibold">{meta.llm_provider}</span>
        </div>
      )}
    </div>
  );
};
