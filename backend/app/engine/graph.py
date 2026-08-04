from collections import Counter, defaultdict, deque
from collections.abc import Iterable
from dataclasses import asdict, dataclass

from app.schemas import (
    FALLBACK_ROUTE,
    Graph,
    GraphEdge,
    InputNode,
    OutputNode,
    RetrieverNode,
    RouterNode,
)


@dataclass(frozen=True)
class GraphIssue:
    message: str
    node_id: str | None = None
    edge_id: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        return asdict(self)


class CycleError(ValueError):
    def __init__(self, node_ids: list[str]) -> None:
        super().__init__(f"Graph contains a cycle through: {', '.join(node_ids)}")
        self.node_ids = node_ids


def topological_order(node_ids: Iterable[str], edges: Iterable[GraphEdge]) -> list[str]:
    """Kahn's algorithm in O(V + E). Ties resolve in declaration order for stable plans.

    On failure, raises CycleError with only the nodes that lie on (or between) cycles: the
    residual graph is pruned of sinks so purely downstream nodes are not blamed.
    """
    in_degree = {node_id: 0 for node_id in node_ids}
    successors: defaultdict[str, list[str]] = defaultdict(list)
    for edge in edges:
        successors[edge.source].append(edge.target)
        in_degree[edge.target] += 1

    queue = deque(node_id for node_id, degree in in_degree.items() if degree == 0)
    order: list[str] = []
    while queue:
        node_id = queue.popleft()
        order.append(node_id)
        for target in successors[node_id]:
            in_degree[target] -= 1
            if in_degree[target] == 0:
                queue.append(target)

    if len(order) == len(in_degree):
        return order

    residual = {node_id for node_id, degree in in_degree.items() if degree > 0}
    out_degree = {n: sum(t in residual for t in successors[n]) for n in residual}
    predecessors: defaultdict[str, list[str]] = defaultdict(list)
    for source in residual:
        for target in successors[source]:
            if target in residual:
                predecessors[target].append(source)
    sinks = deque(n for n, degree in out_degree.items() if degree == 0)
    while sinks:
        sink = sinks.popleft()
        residual.discard(sink)
        for source in predecessors[sink]:
            out_degree[source] -= 1
            if out_degree[source] == 0:
                sinks.append(source)
    raise CycleError(sorted(residual))


def validate_graph(graph: Graph) -> list[GraphIssue]:
    if not graph.nodes:
        return [GraphIssue("Workflow has no nodes.")]

    issues: list[GraphIssue] = []
    nodes = {node.id: node for node in graph.nodes}

    for node_id, count in Counter(node.id for node in graph.nodes).items():
        if count > 1:
            issues.append(GraphIssue(f"Node id '{node_id}' is used {count} times.", node_id))
    for edge_id, count in Counter(edge.id for edge in graph.edges).items():
        if count > 1:
            issues.append(GraphIssue(f"Edge id '{edge_id}' is duplicated.", edge_id=edge_id))

    incoming: Counter[str] = Counter()
    sound_edges: list[GraphEdge] = []
    for edge in graph.edges:
        if edge.source not in nodes or edge.target not in nodes:
            issues.append(GraphIssue("Edge references a node that does not exist.", None, edge.id))
            continue
        if edge.source == edge.target:
            issues.append(GraphIssue("A node cannot connect to itself.", edge.source, edge.id))
            continue
        source = nodes[edge.source]
        if isinstance(source, RouterNode):
            handles = {route.key for route in source.config.routes} | {FALLBACK_ROUTE}
            if edge.source_handle not in handles:
                issues.append(
                    GraphIssue(
                        f"Edge from '{source.display_name}' must leave from a route handle.",
                        source.id,
                        edge.id,
                    )
                )
        incoming[edge.target] += 1
        sound_edges.append(edge)

    for node in graph.nodes:
        if isinstance(node, InputNode):
            if incoming[node.id]:
                issues.append(GraphIssue("Input nodes cannot have incoming edges.", node.id))
        elif not incoming[node.id]:
            issues.append(GraphIssue(f"'{node.display_name}' has no upstream connection.", node.id))

        if isinstance(node, RetrieverNode) and node.config.collection_id is None:
            issues.append(GraphIssue(f"'{node.display_name}' needs a collection.", node.id))
        if isinstance(node, RouterNode):
            keys = [route.key for route in node.config.routes]
            if FALLBACK_ROUTE in keys:
                issues.append(GraphIssue(f"Route key '{FALLBACK_ROUTE}' is reserved.", node.id))
            for key, count in Counter(keys).items():
                if count > 1:
                    issues.append(GraphIssue(f"Route '{key}' is defined twice.", node.id))

    for kind, label in ((InputNode, "Input"), (OutputNode, "Output")):
        keyed = [node for node in graph.nodes if isinstance(node, kind)]
        for key, count in Counter(node.config.key for node in keyed).items():
            if count > 1:
                issues.append(GraphIssue(f"{label} key '{key}' is used by {count} nodes."))

    if not any(isinstance(node, OutputNode) for node in graph.nodes):
        issues.append(GraphIssue("Add at least one Output node."))

    if len(nodes) == len(graph.nodes):
        try:
            topological_order(nodes, sound_edges)
        except CycleError as exc:
            issues.extend(GraphIssue("Node lies on a cycle.", node_id) for node_id in exc.node_ids)

    return issues
