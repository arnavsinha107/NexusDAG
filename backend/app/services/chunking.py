import re
from collections.abc import Iterator

_HEADING = re.compile(r"^#{1,6}\s+\S")
_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+(?=[\"'(\[A-Z0-9])")


def _sentences(block: str) -> Iterator[str]:
    buffer: list[str] = []
    for line in block.splitlines():
        stripped = line.strip()
        if _HEADING.match(stripped):
            if buffer:
                yield from _SENTENCE_BREAK.split(" ".join(buffer))
                buffer = []
            yield stripped
        elif stripped:
            buffer.append(stripped)
    if buffer:
        yield from _SENTENCE_BREAK.split(" ".join(buffer))


def _hard_wrap(sentence: str, size: int) -> Iterator[str]:
    while len(sentence) > size:
        cut = sentence.rfind(" ", 0, size)
        cut = cut if cut > size // 2 else size
        yield sentence[:cut].strip()
        sentence = sentence[cut:].strip()
    if sentence:
        yield sentence


def chunk_text(text: str, size: int = 800, overlap: int = 120) -> list[str]:
    """Split text into retrieval chunks of at most `size` characters.

    Sentences are packed greedily. Markdown headings force a hard boundary so no chunk
    straddles two sections. Up to `overlap` characters of trailing sentences are carried
    into the next chunk to preserve context across boundaries; a chunk is never emitted
    if it would consist solely of carried-over text.
    """
    if size <= 0 or not 0 <= overlap < size:
        raise ValueError("chunk size must be positive and overlap must be in [0, size)")

    chunks: list[str] = []
    current: list[str] = []
    length = 0
    carried = 0

    def emit(carry: bool) -> None:
        nonlocal current, length, carried
        if len(current) > carried:
            chunks.append(" ".join(current))
        tail: list[str] = []
        tail_len = 0
        if carry:
            for sentence in reversed(current):
                if tail_len + len(sentence) + 1 > overlap:
                    break
                tail.insert(0, sentence)
                tail_len += len(sentence) + 1
        current, length, carried = tail, tail_len, len(tail)

    for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n")):
        if not block.strip():
            continue
        for sentence in _sentences(block):
            if _HEADING.match(sentence):
                emit(carry=False)
            for piece in _hard_wrap(sentence.strip(), size):
                if current and length + len(piece) + 1 > size:
                    emit(carry=True)
                    if current and length + len(piece) + 1 > size:
                        current, length, carried = [], 0, 0
                current.append(piece)
                length += len(piece) + 1
    emit(carry=False)
    return chunks
