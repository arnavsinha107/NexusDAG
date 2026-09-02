"use client";

import React, { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeTypes,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { InputNodeComponent } from "../nodes/InputNodeComponent";
import { RetrieverNodeComponent } from "../nodes/RetrieverNodeComponent";
import { RouterNodeComponent } from "../nodes/RouterNodeComponent";
import { AgentNodeComponent } from "../nodes/AgentNodeComponent";
import { TransformerNodeComponent } from "../nodes/TransformerNodeComponent";
import { OutputNodeComponent } from "../nodes/OutputNodeComponent";
import { DAGNode, DAGEdge, NodeType, NodeStatus } from "@/app/types";

interface WorkflowCanvasProps {
  initialNodes: DAGNode[];
  initialEdges: DAGEdge[];
  nodeStatuses: Record<string, NodeStatus>;
  selectedRouteMap: Record<string, string>;
  liveTokens: Record<string, string>;
  onSelectNode: (node: DAGNode | null) => void;
  onGraphChange?: (nodes: DAGNode[], edges: DAGEdge[]) => void;
  isRunning: boolean;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  initialNodes,
  initialEdges,
  nodeStatuses,
  selectedRouteMap,
  liveTokens,
  onSelectNode,
  onGraphChange,
  isRunning,
}) => {
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      input: InputNodeComponent,
      vector_retriever: RetrieverNodeComponent,
      semantic_router: RouterNodeComponent,
      agent: AgentNodeComponent,
      transformer: TransformerNodeComponent,
      output: OutputNodeComponent,
    }),
    []
  );

  // Transform domain DAGNode to ReactFlow Node
  const flowNodes: Node[] = useMemo(() => {
    return initialNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        label: n.label,
        config: n.config,
        status: nodeStatuses[n.id] || "pending",
        selectedRoute: selectedRouteMap[n.id],
        liveToken: liveTokens[n.id],
      },
    }));
  }, [initialNodes, nodeStatuses, selectedRouteMap, liveTokens]);

  const flowEdges: Edge[] = useMemo(() => {
    return initialEdges.map((e) => {
      const sourceStatus = nodeStatuses[e.source];
      const targetStatus = nodeStatuses[e.target];
      const isTraversing =
        sourceStatus === "succeeded" &&
        (targetStatus === "running" || targetStatus === "succeeded");

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.source_handle || undefined,
        animated: isRunning && isTraversing,
        style: {
          stroke: isTraversing ? "#f59e0b" : "#383d47",
          strokeWidth: isTraversing ? 2 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: isTraversing ? "#f59e0b" : "#4b5563",
        },
      };
    });
  }, [initialEdges, nodeStatuses, isRunning]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Synchronize incoming props
  React.useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  React.useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge(
          {
            ...params,
            id: `e_${params.source}_${params.target}_${params.sourceHandle || "main"}`,
          },
          eds
        );
        if (onGraphChange) {
          const domainEdges: DAGEdge[] = next.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            source_handle: e.sourceHandle || null,
          }));
          onGraphChange(initialNodes, domainEdges);
        }
        return next;
      });
    },
    [setEdges, onGraphChange, initialNodes]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const found = initialNodes.find((n) => n.id === node.id);
      if (found) {
        onSelectNode(found);
      }
    },
    [initialNodes, onSelectNode]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // Node addition utility
  const handleAddNode = (type: NodeType) => {
    const id = `node_${type}_${Date.now().toString(36).slice(-4)}`;
    let defaultConfig: any = {};
    let label = "";

    switch (type) {
      case "input":
        label = "Input Parameter";
        defaultConfig = { key: "query" };
        break;
      case "vector_retriever":
        label = "pgvector Retriever";
        defaultConfig = {
          collection_id: null,
          top_k: 4,
          min_score: 0.1,
          query_template: "{{upstream}}",
        };
        break;
      case "semantic_router":
        label = "Semantic Router";
        defaultConfig = {
          threshold: 0.35,
          input_template: "{{upstream}}",
          routes: [{ key: "branch_a", utterances: ["intent sample"] }],
        };
        break;
      case "agent":
        label = "LLM Agent";
        defaultConfig = {
          system_prompt: "You are an assistant.",
          prompt_template: "{{upstream}}",
          model: "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 512,
        };
        break;
      case "transformer":
        label = "Data Transformer";
        defaultConfig = {
          operation: "template",
          template: "{{upstream}}",
          max_chars: 2000,
          json_key: "",
        };
        break;
      case "output":
        label = "Streamed Output";
        defaultConfig = { key: "result", template: "{{upstream}}" };
        break;
    }

    const newNode: DAGNode = {
      id,
      type,
      label,
      position: { x: 300 + Math.random() * 80, y: 200 + Math.random() * 80 },
      config: defaultConfig,
    };

    const nextNodes = [...initialNodes, newNode];
    if (onGraphChange) {
      onGraphChange(nextNodes, initialEdges);
    }
  };

  return (
    <div className="relative w-full h-full bg-canvas select-none">
      {/* Top canvas quick node palette */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 p-1 bg-surface/90 backdrop-blur border border-surface-border rounded-[4px] shadow-sm">
        <span className="font-mono text-[10px] uppercase font-bold text-ink-dim px-2 tracking-wider">
          Add Node
        </span>
        {(
          [
            ["input", "In"],
            ["vector_retriever", "Vector"],
            ["semantic_router", "Router"],
            ["agent", "Agent"],
            ["transformer", "Transform"],
            ["output", "Output"],
          ] as const
        ).map(([type, label]) => (
          <button
            key={type}
            onClick={() => handleAddNode(type)}
            className="px-2 py-1 font-mono text-xs rounded-[3px] bg-surface-subtle border border-surface-border text-ink-muted hover:text-ink hover:border-ink-muted transition-colors"
          >
            + {label}
          </button>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        defaultEdgeOptions={{
          style: { stroke: "#383d47", strokeWidth: 1.5 },
        }}
      >
        <Background color="#1e2229" gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "vector_retriever") return "#f59e0b";
            if (n.type === "semantic_router") return "#3b82f6";
            if (n.type === "agent") return "#10b981";
            return "#4b5563";
          }}
          maskColor="rgba(12, 13, 14, 0.7)"
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
};
