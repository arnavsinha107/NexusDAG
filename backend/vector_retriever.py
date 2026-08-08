import numpy as np
from typing import List
from app.services.embeddings import HashEmbedder, SentenceTransformerEmbedder

class VectorRetrieverNode:
    """AI Vector Retrieval & Embedding Engine for DAG Nodes"""

    def __init__(self):
        try:
            self._impl = SentenceTransformerEmbedder('all-MiniLM-L6-v2')
        except Exception:
            self._impl = HashEmbedder()

    def embed_text(self, text: str) -> List[float]:
        return self._impl.embed([text])[0].tolist()

    @staticmethod
    def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        a = np.array(vec1, dtype=np.float32)
        b = np.array(vec2, dtype=np.float32)
        norm = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / norm) if norm > 0 else 0.0
