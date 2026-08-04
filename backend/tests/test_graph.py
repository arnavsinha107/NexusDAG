import pytest
from app.engine.graph import CycleError, topological_order, validate_graph
from app.schemas import Graph, GraphEdge


def test_topological_sort_linear():
    nodes = ["a", "b", "c"]
    edges = [GraphEdge(id="1", source="a", target="b"), GraphEdge(id="2", source="b", target="c")]
    order = topological_order(nodes, edges)
    assert order == ["a", "b", "c"]


def test_topological_sort_branching():
    nodes = ["root", "left", "right", "sink"]
    edges = [
        GraphEdge(id="1", source="root", target="left"),
        GraphEdge(id="2", source="root", target="right"),
        GraphEdge(id="3", source="left", target="sink"),
        GraphEdge(id="4", source="right", target="sink"),
    ]
    order = topological_order(nodes, edges)
    assert order[0] == "root"
    assert order[-1] == "sink"
    assert set(order[1:3]) == {"left", "right"}


def test_topological_sort_detects_cycle():
    nodes = ["a", "b", "c"]
    edges = [
        GraphEdge(id="1", source="a", target="b"),
        GraphEdge(id="2", source="b", target="c"),
        GraphEdge(id="3", source="c", target="a"),
    ]
    with pytest.raises(CycleError) as exc:
        topological_order(nodes, edges)
    assert set(exc.value.node_ids) == {"a", "b", "c"}


def test_validate_graph_flags_cycle():
    raw_graph = {
        "nodes": [
            {"id": "n1", "type": "input", "label": "In", "config": {"key": "q"}},
            {"id": "n2", "type": "agent", "label": "A", "config": {}},
            {"id": "n3", "type": "agent", "label": "B", "config": {}},
            {"id": "n4", "type": "output", "label": "Out", "config": {"key": "res"}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
            {"id": "e3", "source": "n3", "target": "n2"},
            {"id": "e4", "source": "n3", "target": "n4"},
        ],
    }
    graph = Graph.model_validate(raw_graph)
    issues = validate_graph(graph)
    assert any("cycle" in i.message.lower() for i in issues)
