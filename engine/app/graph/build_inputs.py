"""Graph build input loading: database queries and streaming embedding access."""

from __future__ import annotations

import logging
import struct
from collections.abc import Generator
from typing import TYPE_CHECKING


from app.langfuse_config import SPAN_GRAPH_BUILD_VECTORS, observe
from app import db
from app.graph._util import require_numpy
from app.graph.build_common import GraphInputData
from app.graph.build_common import _mark_graph_run_stage
from app.graph.checkpoints import GraphBuildCheckpointPaths
from app.graph.checkpoints import load_array
from app.graph.checkpoints import save_array
from app.graph.checkpoints import update_checkpoint_metadata

if TYPE_CHECKING:
    import numpy

logger = logging.getLogger(__name__)


def _parse_embedding(text: str) -> numpy.ndarray:
    """Parse a TEXT-format pgvector embedding (e.g. '[0.1,0.2,...]')."""
    np = require_numpy()
    return np.fromstring(text.strip()[1:-1], sep=",", dtype=np.float32)


def _parse_pgvector_binary(data: bytes | memoryview) -> numpy.ndarray:
    """Parse a binary pgvector vector into a numpy float32 array.

    pgvector binary wire format (vector_send):
      - 2 bytes: dimension count (big-endian uint16)
      - 2 bytes: unused/flags (big-endian uint16, 0 for dense)
      - dim × 4 bytes: float32 elements (big-endian IEEE 754)

    This is ~40x faster than text parsing: no string allocation, no
    strtof() calls — just a memcpy + byteswap.
    """
    np = require_numpy()
    buf = bytes(data) if isinstance(data, memoryview) else data
    if len(buf) < 4:
        raise ValueError(f"pgvector binary too short: {len(buf)} bytes")
    dim = struct.unpack_from("!H", buf, 0)[0]
    expected = 4 + dim * 4
    if len(buf) != expected:
        raise ValueError(f"pgvector binary size mismatch: expected {expected}, got {len(buf)}")
    # Read big-endian float32 array and byteswap to native order
    arr = np.frombuffer(buf, dtype=">f4", offset=4, count=dim)
    return arr.astype(np.float32, copy=True)  # byteswap to native


def _parse_pgvector_into(data: bytes | memoryview, out: numpy.ndarray) -> None:
    """Parse a binary pgvector vector directly into a pre-allocated row.

    Same format as _parse_pgvector_binary but writes into ``out`` instead of
    allocating a new array. This avoids 100K tiny array allocations per chunk
    that fragment Python's memory allocator and prevent pages from being
    returned to the OS.
    """
    np = require_numpy()
    buf = bytes(data) if isinstance(data, memoryview) else data
    dim = struct.unpack_from("!H", buf, 0)[0]
    out[:dim] = np.frombuffer(buf, dtype=">f4", offset=4, count=dim).astype(np.float32)


def _graph_input_count(limit: int = 0) -> int:
    base_query = """
        SELECT mp.corpus_id
        FROM solemd.mapped_papers mp
        JOIN solemd.papers p ON p.corpus_id = mp.corpus_id
        WHERE p.embedding IS NOT NULL
        ORDER BY mp.corpus_id
    """
    query = f"SELECT count(*) AS n FROM ({base_query}) t"
    params: tuple[int, ...] | tuple[()] = ()
    if limit > 0:
        query = f"SELECT count(*) AS n FROM ({base_query} LIMIT %s) t"
        params = (limit,)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()["n"]


def _first_embedding() -> str | None:
    query = """
        SELECT p.embedding::TEXT AS embedding_text
        FROM solemd.mapped_papers mp
        JOIN solemd.papers p ON p.corpus_id = mp.corpus_id
        WHERE p.embedding IS NOT NULL
        ORDER BY mp.corpus_id
        LIMIT 1
    """
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(query)
        row = cur.fetchone()
    if not row:
        return None
    return row["embedding_text"]


_EMBED_CHUNK = 100_000


def stream_embedding_chunks(
    limit: int = 0,
    chunk_size: int = _EMBED_CHUNK,
) -> Generator[tuple[numpy.ndarray, numpy.ndarray, numpy.ndarray], None, None]:
    """Yield (corpus_ids, citation_counts, embeddings) chunks via binary COPY.

    Uses ``COPY (SELECT ...) TO STDOUT (FORMAT BINARY)`` with pgvector's
    native ``vector_send`` format. This eliminates 768 strtof() calls per
    row (1.92 billion total at 2.5M papers).

    Arrays are pre-allocated per chunk and filled row-by-row to avoid
    100K tiny numpy array allocations that fragment Python's memory
    allocator and prevent pages from being returned to the OS.

    Each chunk is ~300 MB (100K rows x 768 floats x 4 bytes). The caller
    processes and discards each chunk before requesting the next.
    """
    np = require_numpy()
    count = _graph_input_count(limit=limit)
    if count == 0:
        return

    # Detect embedding dimension for pre-allocation
    first_text = _first_embedding()
    if first_text is None:
        return
    embedding_dim = _parse_embedding(first_text).shape[0]

    remaining = count if limit <= 0 else min(limit, count)
    last_corpus_id = 0
    with db.pooled() as conn:
        while remaining > 0:
            fetch_size = min(chunk_size, remaining)

            # Pre-allocate arrays for the entire chunk
            chunk_ids = np.empty(fetch_size, dtype=np.int64)
            chunk_citations = np.empty(fetch_size, dtype=np.int32)
            chunk_embeddings = np.empty((fetch_size, embedding_dim), dtype=np.float32)
            row_count = 0

            with conn.cursor() as cur:
                with cur.copy(
                    """COPY (
                        SELECT
                            mp.corpus_id,
                            COALESCE(p.citation_count, 0) AS citation_count,
                            p.embedding
                        FROM solemd.mapped_papers mp
                        JOIN solemd.papers p ON p.corpus_id = mp.corpus_id
                        WHERE p.embedding IS NOT NULL
                          AND mp.corpus_id > %s
                        ORDER BY mp.corpus_id
                        LIMIT %s
                    ) TO STDOUT (FORMAT BINARY)""",
                    (last_corpus_id, fetch_size),
                ) as copy:
                    copy.set_types([20, 23, 0])  # int8, int4, raw bytes (vector)
                    for row in copy.rows():
                        corpus_id, citation_count, embedding_bytes = row
                        chunk_ids[row_count] = corpus_id
                        chunk_citations[row_count] = citation_count or 0
                        _parse_pgvector_into(embedding_bytes, chunk_embeddings[row_count])
                        row_count += 1

            if row_count == 0:
                break

            # Trim if fewer rows than expected (last chunk)
            if row_count < fetch_size:
                chunk_ids = chunk_ids[:row_count]
                chunk_citations = chunk_citations[:row_count]
                chunk_embeddings = chunk_embeddings[:row_count]

            yield chunk_ids, chunk_citations, chunk_embeddings

            last_corpus_id = int(chunk_ids[-1])
            remaining -= row_count


def _load_ids_only(limit: int = 0) -> GraphInputData:
    """Load just corpus_ids and citation_counts (~30 MB for 2.5M rows).

    Used by stages that need IDs for DB writes but not the embeddings
    themselves (which are streamed separately for dimensionality reduction).
    """
    np = require_numpy()
    count = _graph_input_count(limit=limit)
    if count == 0:
        return GraphInputData(
            corpus_ids=np.empty(shape=(0,), dtype=np.int64),
            citation_counts=np.empty(shape=(0,), dtype=np.int32),
        )

    corpus_ids = np.empty(shape=(count,), dtype=np.int64)
    citation_counts = np.empty(shape=(count,), dtype=np.int32)

    id_query = """
        SELECT
            mp.corpus_id,
            COALESCE(p.citation_count, 0) AS citation_count
        FROM solemd.mapped_papers mp
        JOIN solemd.papers p ON p.corpus_id = mp.corpus_id
        WHERE p.embedding IS NOT NULL
          AND mp.corpus_id > %s
        ORDER BY mp.corpus_id
        LIMIT %s
    """
    remaining = count if limit <= 0 else min(limit, count)
    index = 0
    last_corpus_id = 0
    with db.pooled() as conn:
        while remaining > 0:
            fetch_size = min(_EMBED_CHUNK, remaining)
            with conn.cursor() as cur:
                cur.execute(id_query, (last_corpus_id, fetch_size))
                rows = cur.fetchall()
            if not rows:
                break
            for row in rows:
                corpus_ids[index] = int(row["corpus_id"])
                citation_counts[index] = int(row["citation_count"] or 0)
                index += 1
            last_corpus_id = int(rows[-1]["corpus_id"])
            remaining -= len(rows)

    if index != count:
        raise RuntimeError(f"graph input load mismatch: expected {count} rows, loaded {index}")

    return GraphInputData(
        corpus_ids=corpus_ids,
        citation_counts=citation_counts,
    )


def _load_checkpointed_ids(
    paths: GraphBuildCheckpointPaths,
):
    corpus_ids = load_array(paths.corpus_ids_path, mmap_mode="r")
    citation_counts = load_array(paths.citation_counts_path, mmap_mode="r")
    if corpus_ids is None or citation_counts is None:
        return None, None
    return corpus_ids, citation_counts


@observe(name=SPAN_GRAPH_BUILD_VECTORS)
def _ensure_input_vectors(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    limit: int,
) -> tuple[numpy.ndarray, numpy.ndarray, bool]:
    """Load or checkpoint corpus_ids and citation_counts.

    Returns (corpus_ids, citation_counts, needs_layout) where needs_layout
    indicates whether the layout matrix still needs to be computed (and
    embeddings need to be streamed).
    """
    corpus_ids, citation_counts = _load_checkpointed_ids(checkpoint_paths_)
    needs_layout = not checkpoint_paths_.layout_matrix_path.exists()

    if corpus_ids is not None and citation_counts is not None:
        return corpus_ids, citation_counts, needs_layout

    _mark_graph_run_stage(
        graph_run_id,
        stage="load_inputs",
        paths=checkpoint_paths_,
    )
    input_data = _load_ids_only(limit=limit)
    save_array(checkpoint_paths_.corpus_ids_path, input_data.corpus_ids)
    save_array(checkpoint_paths_.citation_counts_path, input_data.citation_counts)
    update_checkpoint_metadata(
        checkpoint_paths_,
        stage="inputs",
        payload={"paper_count": int(input_data.corpus_ids.shape[0])},
    )
    return input_data.corpus_ids, input_data.citation_counts, needs_layout
