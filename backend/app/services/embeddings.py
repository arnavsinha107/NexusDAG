import hashlib
import re
import threading
from collections.abc import Sequence
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from app.config import EMBEDDING_DIM, Settings

Matrix = NDArray[np.float32]

_TOKEN = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")
_STOPWORDS = frozenset(
    "a an and are as at be by can do does for from has have how i in is it its me my of on "
    "or our so that the this to was we what when where which who why will with you your".split()
)


class Embedder(Protocol):
    name: str
    dim: int

    def embed(self, texts: Sequence[str]) -> Matrix: ...


def cosine_similarity(a: Sequence[float] | Matrix, b: Sequence[float] | Matrix) -> float:
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return float(np.dot(va, vb) / denom) if denom else 0.0


def _normalize(matrix: Matrix) -> Matrix:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (matrix / norms).astype(np.float32)


class HashEmbedder:
    """Signed feature hashing over word unigrams and bigrams.

    Deterministic and dependency-free. Used in tests, CI, and air-gapped installs where
    downloading a transformer checkpoint is not possible. Captures lexical, not semantic,
    similarity.
    """

    name = "hash"

    def __init__(self, dim: int = EMBEDDING_DIM) -> None:
        self.dim = dim

    def embed(self, texts: Sequence[str]) -> Matrix:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for row, text in enumerate(texts):
            tokens = [t for t in _TOKEN.findall(text.lower()) if t not in _STOPWORDS]
            features = tokens + [f"{a} {b}" for a, b in zip(tokens, tokens[1:], strict=False)]
            for feature in features:
                value = int.from_bytes(
                    hashlib.blake2b(feature.encode(), digest_size=8).digest(), "little"
                )
                out[row, value % self.dim] += 1.0 if value >> 63 else -1.0
        return _normalize(out)


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str, dim: int = EMBEDDING_DIM) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "sentence-transformers is not installed. Install the 'ml' extra "
                "or set NEXUS_EMBEDDING_PROVIDER=hash."
            ) from exc
        try:
            self._model = SentenceTransformer(model_name, local_files_only=True)
        except Exception:
            self._model = SentenceTransformer(model_name)
        actual = self._model.get_sentence_embedding_dimension()
        if actual != dim:
            raise RuntimeError(
                f"Embedding model '{model_name}' produces {actual}-d vectors; "
                f"the vector store schema expects {dim}."
            )
        self.name = model_name
        self.dim = dim
        # Torch modules are not guaranteed re-entrant across threads.
        self._lock = threading.Lock()

    def embed(self, texts: Sequence[str]) -> Matrix:
        with self._lock:
            vectors = self._model.encode(
                list(texts),
                batch_size=32,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        return np.asarray(vectors, dtype=np.float32)


def build_embedder(settings: Settings) -> Embedder:
    if settings.embedding_provider == "hash":
        return HashEmbedder()
    return SentenceTransformerEmbedder(settings.embedding_model)
