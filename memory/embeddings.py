"""
Local sentence-transformers embeddings, no API calls needed.

Model: all-MiniLM-L6-v2
- 384-dimensional vectors
- ~80MB download on first use (cached in ~/.cache/huggingface)
- Runs on CPU, fast enough for this use case
"""

import structlog
from sentence_transformers import SentenceTransformer

log = structlog.get_logger()

_model: SentenceTransformer | None = None
EMBEDDING_DIM = 384


def get_model() -> SentenceTransformer:
    """Lazy-load the model so it's only downloaded when first needed."""
    global _model
    if _model is None:
        log.info("loading_embedding_model", model="all-MiniLM-L6-v2")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        log.info("embedding_model_ready")
    return _model


def embed(text: str) -> list[float]:
    """Convert text to a 384-dim embedding vector."""
    model = get_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts in a single batch, faster than calling embed() one by one."""
    model = get_model()
    vectors = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return [v.tolist() for v in vectors]
