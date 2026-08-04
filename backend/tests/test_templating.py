from app.engine.templating import render_template


def test_render_template_basic():
    scope = {"inputs": {"query": "Hello World"}, "upstream": "context data"}
    rendered, missing = render_template("Q: {{inputs.query}} / {{upstream}}", scope)
    assert rendered == "Q: Hello World / context data"
    assert missing == []


def test_render_template_missing_vars():
    scope = {"inputs": {"query": "Hello"}}
    rendered, missing = render_template("Q: {{inputs.missing_key}}", scope)
    assert rendered == "Q: "
    assert missing == ["inputs.missing_key"]
