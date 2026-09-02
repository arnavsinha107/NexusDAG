"use client";

import React, { useState, useEffect, useRef } from "react";
import { RunEvent, RunStatus } from "@/app/types";

interface TelemetryDrawerProps {
  events: RunEvent[];
  activeRunId: string | null;
  runStatus: RunStatus | null;
  outputs: Record<string, string>;
  error: string | null;
  liveTokens: Record<string, string>;
  onCancelRun?: () => void;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({
  events,
  activeRunId,
  runStatus,
  outputs,
  error,
  liveTokens,
  onCancelRun,
}) => {
  const [tab, setTab] = useState<"logs" | "tokens" | "outputs">("logs");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll, liveTokens]);

  const outputKeys = Object.keys(outputs);

  return (
    <div className="flex flex-col h-full bg-surface border-t lg:border-t-0 lg:border-l border-surface-border text-xs font-mono select-text">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border bg-surface-subtle">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-ink-dim tracking-wider">
            Telemetry
          </span>
          {activeRunId && (
            <span className="text-[10px] text-ink-muted truncate max-w-[140px]">
              #{activeRunId.slice(0, 8)}
            </span>
          )}
          {runStatus && (
            <span
              className={`px-1.5 py-0.5 rounded-[2px] text-[10px] uppercase font-semibold ${
                runStatus === "running"
                  ? "bg-brand-amber/15 text-brand-amber animate-pulse"
                  : runStatus === "succeeded"
                  ? "bg-brand-emerald/15 text-brand-emerald"
                  : runStatus === "failed"
                  ? "bg-brand-crimson/15 text-brand-crimson"
                  : "bg-surface text-ink-dim"
              }`}
            >
              {runStatus}
            </span>
          )}
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("logs")}
            className={`px-2 py-0.5 rounded-[2px] transition-colors ${
              tab === "logs"
                ? "bg-surface border border-surface-border text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Logs ({events.length})
          </button>
          <button
            onClick={() => setTab("tokens")}
            className={`px-2 py-0.5 rounded-[2px] transition-colors ${
              tab === "tokens"
                ? "bg-surface border border-surface-border text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Tokens
          </button>
          <button
            onClick={() => setTab("outputs")}
            className={`px-2 py-0.5 rounded-[2px] transition-colors ${
              tab === "outputs"
                ? "bg-surface border border-surface-border text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Outputs {outputKeys.length > 0 && `(${outputKeys.length})`}
          </button>

          {runStatus === "running" && onCancelRun && (
            <button
              onClick={onCancelRun}
              className="ml-2 px-2 py-0.5 rounded-[2px] bg-brand-crimson/15 border border-brand-crimson/40 text-brand-crimson hover:bg-brand-crimson/25 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Main Drawer Body */}
      <div className="flex-1 overflow-hidden relative">
        {tab === "logs" && (
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto p-3 space-y-1 font-mono text-[11px] leading-relaxed bg-canvas"
          >
            {events.length === 0 ? (
              <div className="text-ink-dim py-8 text-center">
                Awaiting execution telemetry stream...
              </div>
            ) : (
              events.map((ev, i) => {
                const timeStr = ev.ts ? ev.ts.slice(11, 19) : "";
                const isErr =
                  ev.type.includes("failed") || ev.type.includes("error");
                const isWarn = ev.type.includes("skipped");

                return (
                  <div
                    key={`${ev.seq}-${i}`}
                    className={`flex items-start gap-2 hover:bg-surface/50 px-1 py-0.5 rounded-[2px] ${
                      isErr
                        ? "text-brand-crimson bg-brand-crimson/5"
                        : isWarn
                        ? "text-ink-dim"
                        : "text-ink-muted"
                    }`}
                  >
                    <span className="text-ink-dim select-none shrink-0 w-14">
                      {timeStr}
                    </span>
                    <span className="shrink-0 uppercase px-1 rounded-[2px] bg-surface-subtle border border-surface-border text-[9px] text-ink font-semibold">
                      {ev.node_id || "RUN"}
                    </span>
                    <span className="shrink-0 text-ink-dim text-[10px]">
                      {ev.type}
                    </span>
                    <span className="text-ink break-words flex-1">
                      {ev.data.message ||
                        ev.data.error ||
                        (ev.data.status && `Status: ${ev.data.status}`) ||
                        (ev.data.token && `"${ev.data.token}"`) ||
                        JSON.stringify(ev.data)}
                    </span>
                  </div>
                );
              })
            )}

            {error && (
              <div className="p-2 border border-brand-crimson bg-brand-crimson/10 text-brand-crimson rounded-[3px] mt-2">
                [FATAL RUN ERROR]: {error}
              </div>
            )}
          </div>
        )}

        {tab === "tokens" && (
          <div className="h-full overflow-y-auto p-4 bg-canvas space-y-4">
            {Object.keys(liveTokens).length === 0 ? (
              <div className="text-ink-dim py-8 text-center">
                No active token stream. Trigger a run with an agent node to observe live SSE tokens.
              </div>
            ) : (
              Object.entries(liveTokens).map(([nodeId, tokens]) => (
                <div
                  key={nodeId}
                  className="border border-surface-border rounded-[4px] p-3 bg-surface"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-surface-border text-ink-muted">
                    <span className="font-semibold text-ink">Node: {nodeId}</span>
                    <span className="text-[10px] text-brand-amber">Streaming Active</span>
                  </div>
                  <pre className="font-mono text-xs text-ink whitespace-pre-wrap leading-relaxed">
                    {tokens}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "outputs" && (
          <div className="h-full overflow-y-auto p-4 bg-canvas space-y-3">
            {outputKeys.length === 0 ? (
              <div className="text-ink-dim py-8 text-center">
                No finalized outputs yet. Completed output nodes will populate here.
              </div>
            ) : (
              outputKeys.map((k) => (
                <div
                  key={k}
                  className="border border-surface-border rounded-[4px] p-3 bg-surface"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-surface-border text-ink-muted">
                    <span className="font-semibold text-brand-emerald">
                      Key: outputs.{k}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(outputs[k])}
                      className="text-[10px] px-2 py-0.5 rounded-[2px] bg-surface-subtle border border-surface-border hover:text-ink text-ink-muted"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="font-mono text-xs text-ink whitespace-pre-wrap leading-relaxed">
                    {outputs[k]}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="px-3 py-1.5 border-t border-surface-border bg-surface-subtle flex items-center justify-between text-[10px] text-ink-dim">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded-[2px] bg-surface border-surface-border text-brand-amber focus:ring-0"
          />
          <span>Auto-scroll</span>
        </label>
        <span>Nexus Stream v1.0</span>
      </div>
    </div>
  );
};
