from app.services.chunking import chunk_text


def test_chunking_heading_boundaries():
    text = (
        "# Heading 1\n\nThis is paragraph one under heading one. It contains several sentences.\n\n"
        "# Heading 2\n\nThis is paragraph two under heading two. Completely separate topic."
    )
    chunks = chunk_text(text, size=200, overlap=30)
    assert len(chunks) >= 2
    # First chunk contains heading 1, second chunk begins at heading 2
    assert "Heading 1" in chunks[0]
    assert "Heading 2" in chunks[1]


def test_chunking_overlap():
    text = (
        "Alpha beta gamma delta epsilon zeta. "
        "Eta theta iota kappa lambda mu. "
        "Nu xi omicron pi rho sigma. "
        "Tau upsilon phi chi psi omega."
    )
    chunks = chunk_text(text, size=80, overlap=30)
    assert len(chunks) > 1
