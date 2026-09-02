"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  WorkflowSummary,
  WorkflowDetail,
  DAGNode,
  DAGEdge,
  NodeStatus,
  RunEvent,
  RunStatus,
  Collection,
  Stats,
  EngineMeta,
} from "./types";
import { api } from "./api";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { TelemetryDrawer } from "@/components/telemetry/TelemetryDrawer";
import { NodeInspector } from "@/components/inspector/NodeInspector";
import { KnowledgeView } from "@/components/knowledge/KnowledgeView";
import { RunHistoryView } from "@/components/history/RunHistoryView";
import { StatsHeader } from "@/components/stats/StatsHeader";

export default function NexusDAGDashboard() {
  // Navigation & View
  const [activeView, setActiveView] = useState<"studio" | "knowledge" | "history">("studio");

  // Workflows state
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowDetail | null>(null);
  const [nodes, setNodes] = useState<DAGNode[]>([]);
  const [edges, setEdges] = useState<DAGEdge[]>([]);

  // Selected node for Inspector
  const [selectedNode, setSelectedNode] = useState<DAGNode | null>(null);

  // Collections (for dropdowns)
  const [collections, setCollections] = useState<Collection[]>([]);

  // Telemetry & Stats
  const [stats, setStats] = useState<Stats | null>(null);
  const [meta, setMeta] = useState<EngineMeta | null>(null);
  const [isEngineOnline, setIsEngineOnline] = useState(false);

  // Execution state
  const [queryInput, setQueryInput] = useState(
    "How does the topological sort algorithm handle cycles and branch routing?"
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [selectedRouteMap, setSelectedRouteMap] = useState<Record<string, string>>({});
  const [liveTokens, setLiveTokens] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [runError, setRunError] = useState<string | null>(null);
  const [validationAlert, setValidationAlert] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Initial load
  const loadSystemState = useCallback(async () => {
    try {
      const [wfList, colList, statsData, metaData] = await Promise.all([
        api.listWorkflows(),
        api.listCollections(),
        api.getStats().catch(() => null),
        api.getMeta().catch(() => null),
      ]);
      setWorkflows(wfList);
      setCollections(colList);
      setStats(statsData);
      setMeta(metaData);
      setIsEngineOnline(true);

      if (wfList.length > 0 && !activeWorkflow) {
        const detail = await api.getWorkflow(wfList[0].id);
        setActiveWorkflow(detail);
        setNodes(detail.graph.nodes || []);
        setEdges(detail.graph.edges || []);
      }
    } catch (err) {
      setIsEngineOnline(false);
    }
  }, [activeWorkflow]);

  useEffect(() => {
    loadSystemState();
    const interval = setInterval(() => {
      api.getStats().then(setStats).catch(() => setIsEngineOnline(false));
    }, 5000);
    return () => clearInterval(interval);
  }, [loadSystemState]);

  // Handle workflow selection change
  const handleSelectWorkflow = async (id: string) => {
    try {
      const detail = await api.getWorkflow(id);
      setActiveWorkflow(detail);
      setNodes(detail.graph.nodes || []);
      setEdges(detail.graph.edges || []);
      setSelectedNode(null);
      // Reset statuses
      setNodeStatuses({});
      setSelectedRouteMap({});
      setLiveTokens({});
      setOutputs({});
      setEvents([]);
      setRunStatus(null);
      setActiveRunId(null);
    } catch (err: any) {
      alert(`Failed to load workflow: ${err.message}`);
    }
  };

  // Save graph changes
  const handleSaveGraph = async () => {
    if (!activeWorkflow) return;
    try {
      const updated = await api.updateWorkflow(activeWorkflow.id, {
        graph: { nodes, edges },
      });
      setActiveWorkflow(updated);
      alert("Workflow graph saved successfully.");
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
  };

  // Validate workflow
  const handleValidate = async () => {
    if (!activeWorkflow) return;
    try {
      const res = await api.validateWorkflow(activeWorkflow.id);
      if (res.valid) {
        setValidationAlert("Graph is valid and ready for execution.");
      } else {
        const msgs = res.issues.map((i) => `• ${i.message}`).join("\n");
        setValidationAlert(`Validation Issues:\n${msgs}`);
      }
    } catch (err: any) {
      setValidationAlert(`Validation error: ${err.message}`);
    }
  };

  // Start DAG Run
  const handleExecuteWorkflow = async () => {
    if (!activeWorkflow) return;

    // Reset previous run visual state
    const initialStatusMap: Record<string, NodeStatus> = {};
    nodes.forEach((n) => {
      initialStatusMap[n.id] = "pending";
    });
    setNodeStatuses(initialStatusMap);
    setSelectedRouteMap({});
    setLiveTokens({});
    setOutputs({});
    setEvents([]);
    setRunError(null);
    setValidationAlert(null);
    setIsRunning(true);
    setRunStatus("running");

    try {
      const run = await api.startRun(activeWorkflow.id, {
        query: queryInput.trim(),
      });
      setActiveRunId(run.id);

      // Connect WebSocket stream
      const wsUrl = `ws://localhost:8000/api/runs/ws/${run.id}`;
      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const ev: RunEvent = JSON.parse(event.data);
          setEvents((prev) => [...prev, ev]);

          if (ev.type === "node.started" && ev.node_id) {
            setNodeStatuses((prev) => ({ ...prev, [ev.node_id!]: "running" }));
          } else if (ev.type === "node.token" && ev.node_id && ev.data.token) {
            setLiveTokens((prev) => ({
              ...prev,
              [ev.node_id!]: (prev[ev.node_id!] || "") + ev.data.token,
            }));
          } else if (ev.type === "node.completed" && ev.node_id) {
            setNodeStatuses((prev) => ({ ...prev, [ev.node_id!]: "succeeded" }));
            if (ev.data.route) {
              setSelectedRouteMap((prev) => ({
                ...prev,
                [ev.node_id!]: ev.data.route!,
              }));
            }
          } else if (ev.type === "node.failed" && ev.node_id) {
            setNodeStatuses((prev) => ({ ...prev, [ev.node_id!]: "failed" }));
          } else if (ev.type === "node.skipped" && ev.node_id) {
            setNodeStatuses((prev) => ({ ...prev, [ev.node_id!]: "skipped" }));
          } else if (ev.type === "run.finished") {
            const finalSt = ev.data.status || "succeeded";
            setRunStatus(finalSt);
            setIsRunning(false);
            if (ev.data.outputs) {
              setOutputs(ev.data.outputs);
            }
            if (ev.data.error) {
              setRunError(ev.data.error);
            }
            // Refresh stats & runs
            api.getStats().then(setStats);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        setIsRunning(false);
        setRunStatus("failed");
      };

      ws.onclose = () => {
        setIsRunning(false);
      };
    } catch (err: any) {
      setIsRunning(false);
      setRunStatus("failed");
      setRunError(err.message || "Execution initiation failed");
    }
  };

  const handleCancelRun = async () => {
    if (!activeRunId) return;
    try {
      await api.cancelRun(activeRunId);
      setIsRunning(false);
      setRunStatus("cancelled");
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    }
  };

  // Replay run from history
  const handleReplayRun = async (runId: string) => {
    try {
      const detail = await api.getRun(runId);
      setActiveRunId(detail.id);
      setRunStatus(detail.status);
      setOutputs(detail.outputs);
      setRunError(detail.error);

      // Map node runs to visual state
      const statusMap: Record<string, NodeStatus> = {};
      const tokensMap: Record<string, string> = {};
      detail.node_runs.forEach((nr) => {
        statusMap[nr.node_id] = nr.status;
        if (nr.output_text) {
          tokensMap[nr.node_id] = nr.output_text;
        }
      });
      setNodeStatuses(statusMap);
      setLiveTokens(tokensMap);

      // Reconstruct events for telemetry drawer
      const replayedEvents: RunEvent[] = detail.node_runs.flatMap((nr, i) => [
        {
          seq: i * 2,
          type: `node.${nr.status}`,
          run_id: detail.id,
          node_id: nr.node_id,
          ts: nr.started_at || "",
          data: {
            message: `Status: ${nr.status} (${nr.output_text?.length || 0} chars)`,
          },
        },
      ]);
      setEvents(replayedEvents);
      setActiveView("studio");
    } catch (err: any) {
      alert(`Failed to load run: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-canvas text-ink overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <header className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-surface border-b border-surface-border gap-3 select-none">
        {/* Brand & Workflow Dropdown */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-tight text-ink">
              NEXUS<span className="text-brand-amber">//</span>DAG
            </span>
            <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded-[2px] bg-surface-subtle border border-surface-border text-ink-muted">
              v1.0
            </span>
          </div>

          <div className="h-4 w-[1px] bg-surface-border hidden sm:block" />

          {/* Workflow Picker */}
          <div className="flex items-center gap-2">
            <select
              value={activeWorkflow?.id || ""}
              onChange={(e) => handleSelectWorkflow(e.target.value)}
              className="bg-canvas border border-surface-border rounded-[3px] px-2.5 py-1 text-xs font-mono text-ink focus:outline-none focus:border-ink-muted"
            >
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name} ({wf.node_count} nodes)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-canvas border border-surface-border rounded-[4px] p-0.5 font-mono text-xs">
          <button
            onClick={() => setActiveView("studio")}
            className={`px-3 py-1 rounded-[2px] transition-colors ${
              activeView === "studio"
                ? "bg-surface text-ink font-semibold border border-surface-border"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Studio Canvas
          </button>
          <button
            onClick={() => setActiveView("knowledge")}
            className={`px-3 py-1 rounded-[2px] transition-colors ${
              activeView === "knowledge"
                ? "bg-surface text-ink font-semibold border border-surface-border"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Knowledge Base
          </button>
          <button
            onClick={() => setActiveView("history")}
            className={`px-3 py-1 rounded-[2px] transition-colors ${
              activeView === "history"
                ? "bg-surface text-ink font-semibold border border-surface-border"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Run History
          </button>
        </div>

        {/* Action Controls for Workflow */}
        <div className="flex items-center gap-2">
          {activeView === "studio" && (
            <>
              <button
                onClick={handleValidate}
                className="px-2.5 py-1 rounded-[3px] bg-surface-subtle border border-surface-border text-ink-muted hover:text-ink font-mono text-xs transition-colors"
              >
                Validate
              </button>
              <button
                onClick={handleSaveGraph}
                className="px-2.5 py-1 rounded-[3px] bg-surface-subtle border border-surface-border text-ink hover:border-ink-muted font-mono text-xs transition-colors"
              >
                Save
              </button>
            </>
          )}
        </div>
      </header>

      {/* Telemetry / Metrics Header */}
      <StatsHeader stats={stats} meta={meta} connected={isEngineOnline} />

      {/* Execution Control Subheader (Studio View) */}
      {activeView === "studio" && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-surface-subtle border-b border-surface-border font-mono text-xs select-none">
          <span className="text-[10px] uppercase font-bold text-ink-dim tracking-wider shrink-0">
            Run Input
          </span>
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Type input query payload..."
            className="flex-1 min-w-[240px] bg-canvas border border-surface-border rounded-[3px] px-2.5 py-1 text-ink focus:outline-none focus:border-ink-muted"
          />
          <button
            onClick={handleExecuteWorkflow}
            disabled={isRunning || !isEngineOnline}
            className={`px-4 py-1 rounded-[3px] font-bold transition-all shadow-sm ${
              isRunning
                ? "bg-brand-amber/30 text-brand-amber cursor-not-allowed animate-pulse"
                : "bg-brand-amber text-canvas hover:bg-brand-amber/90 active:scale-[0.98]"
            }`}
          >
            {isRunning ? "Executing DAG..." : "Execute AI DAG Workflow"}
          </button>
        </div>
      )}

      {/* Inline Validation Alert */}
      {validationAlert && (
        <div className="px-4 py-2 bg-surface border-b border-surface-border font-mono text-xs flex items-center justify-between text-ink-muted">
          <pre className="whitespace-pre-wrap">{validationAlert}</pre>
          <button
            onClick={() => setValidationAlert(null)}
            className="text-ink-dim hover:text-ink text-sm px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Primary View Switcher Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {activeView === "studio" && (
          <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
            {/* React Flow DAG Canvas */}
            <div className="flex-1 h-[60%] lg:h-full relative overflow-hidden">
              <WorkflowCanvas
                initialNodes={nodes}
                initialEdges={edges}
                nodeStatuses={nodeStatuses}
                selectedRouteMap={selectedRouteMap}
                liveTokens={liveTokens}
                onSelectNode={setSelectedNode}
                onGraphChange={(n, e) => {
                  setNodes(n);
                  setEdges(e);
                }}
                isRunning={isRunning}
              />
            </div>

            {/* Node Inspector Drawer */}
            {selectedNode && (
              <NodeInspector
                node={selectedNode}
                collections={collections}
                onUpdateNode={(updated) => {
                  setNodes((prev) =>
                    prev.map((n) => (n.id === updated.id ? updated : n))
                  );
                  setSelectedNode(updated);
                }}
                onDeleteNode={(id) => {
                  setNodes((prev) => prev.filter((n) => n.id !== id));
                  setEdges((prev) =>
                    prev.filter((e) => e.source !== id && e.target !== id)
                  );
                  setSelectedNode(null);
                }}
                onClose={() => setSelectedNode(null)}
              />
            )}

            {/* Real-time Telemetry Terminal Drawer */}
            <div className="h-[40%] lg:h-full lg:w-96 shrink-0">
              <TelemetryDrawer
                events={events}
                activeRunId={activeRunId}
                runStatus={runStatus}
                outputs={outputs}
                error={runError}
                liveTokens={liveTokens}
                onCancelRun={handleCancelRun}
              />
            </div>
          </div>
        )}

        {activeView === "knowledge" && (
          <div className="flex-1 h-full overflow-hidden">
            <KnowledgeView />
          </div>
        )}

        {activeView === "history" && (
          <div className="flex-1 h-full overflow-hidden">
            <RunHistoryView onSelectRun={handleReplayRun} />
          </div>
        )}
      </main>
    </div>
  );
}
