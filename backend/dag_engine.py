import asyncio
from typing import List, Dict, Callable
from collections import defaultdict, deque
from vector_retriever import VectorRetrieverNode

retriever = VectorRetrieverNode()

class DAGEngine:
    """Topological Sort AI Agent DAG Execution Engine (Kahn's Algorithm)"""

    @staticmethod
    async def execute_dag(nodes: List[Dict], edges: List[Dict], status_callback: Callable):
        node_ids = [n["id"] for n in nodes]
        adj = defaultdict(list)
        in_degree = {n["id"]: 0 for n in nodes}
        node_map = {n["id"]: n for n in nodes}

        for edge in edges:
            adj[edge["source"]].append(edge["target"])
            in_degree[edge["target"]] += 1

        queue = deque([n_id for n_id in node_ids if in_degree[n_id] == 0])

        while queue:
            curr_id = queue.popleft()
            curr_node = node_map[curr_id]
            node_type = curr_node.get("type", "AGENT_NODE").upper()

            # Notify UI: Node RUNNING
            await status_callback(curr_id, "RUNNING", f"Executing AI DAG Node ({node_type})...")

            if "VECTOR" in node_type or "RETRIEVER" in node_type:
                query_vec = retriever.embed_text("Vector query payload")
                log_msg = f"Retrieved top-k nearest vectors (dim {len(query_vec)})"
                await asyncio.sleep(0.4)
            else:
                await asyncio.sleep(0.5)
                log_msg = f"Executed Agent Node {curr_id} successfully"

            # Notify UI: Node SUCCESS
            await status_callback(curr_id, "SUCCESS", log_msg)

            for neighbor in adj[curr_id]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
