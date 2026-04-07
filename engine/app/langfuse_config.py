"""Centralized Langfuse configuration for the SoleMD.Graph engine.

Single source of truth for:
- Langfuse logger suppression (call ``configure()`` once at startup)
- Safe client access (``get_langfuse()``)
- REST API helper (``langfuse_api()``) for SDK gaps
- Prompt fetching from Langfuse Prompt Management (``get_prompt()``)
- Span naming registry (``SPAN_*`` constants for all ``@observe`` decorators)
- Score name constants matching registered score configs
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 0. Environment — load .env.local so Langfuse SDK finds its keys
# ---------------------------------------------------------------------------
_env_loaded = False


_NEEDED_PREFIXES = ("LANGFUSE_", "GEMINI_", "GOOGLE_API_KEY")


def _load_env_local() -> None:
    """Inject evaluation-relevant vars from .env.local into os.environ.

    Pydantic's ``env_file`` only populates its own model fields — it doesn't
    set ``os.environ``, which the Langfuse SDK and Gemini judge read directly.
    We load ``LANGFUSE_*``, ``GEMINI_*``, and ``GOOGLE_API_KEY`` from the same
    ``.env.local`` that ``config.py`` uses, only when they aren't already set.
    """
    global _env_loaded
    if _env_loaded:
        return
    _env_loaded = True

    env_path = Path(__file__).resolve().parents[2] / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if any(key.startswith(p) for p in _NEEDED_PREFIXES):
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


_load_env_local()

# ---------------------------------------------------------------------------
# 1. Logging — suppress Langfuse SDK noise once, not in every module
# ---------------------------------------------------------------------------
_configured = False


def configure() -> None:
    """Suppress Langfuse SDK logging noise. Safe to call multiple times."""
    global _configured
    if _configured:
        return
    logging.getLogger("langfuse").setLevel(logging.ERROR)
    _configured = True


# Auto-configure on import so downstream modules never need to call it
configure()


# ---------------------------------------------------------------------------
# 1b. Re-export ``observe`` — all modules MUST import from here, not langfuse
# ---------------------------------------------------------------------------
# _load_env_local() has run by this point, so LANGFUSE_PUBLIC_KEY et al. are
# in os.environ before the Langfuse OTel exporter initializes.  Importing
# ``observe`` directly from ``langfuse`` in other modules races with env
# loading and produces silent no-op traces.
from langfuse import observe  # noqa: E402 — intentionally late

# Re-export for ``from app.langfuse_config import observe``
__all__ = ["observe"]


# ---------------------------------------------------------------------------
# 2. Client access — single safe getter, replaces scattered get_client() calls
# ---------------------------------------------------------------------------
def get_langfuse():
    """Return the Langfuse singleton client, or ``None`` if unavailable.

    Wraps ``langfuse.get_client()`` with exception handling so callers
    never need their own try/except.
    """
    try:
        from langfuse import get_client

        return get_client()
    except Exception:
        return None


_score_configs_ensured = False


def ensure_score_configs() -> None:
    """Register all RAG score configs in Langfuse (idempotent, runs once)."""
    global _score_configs_ensured
    if _score_configs_ensured:
        return
    _score_configs_ensured = True
    try:
        from app.rag_ingest.eval_langfuse import ensure_score_configs as _ensure
        _ensure()
    except Exception:
        logger.debug("Score config registration failed", exc_info=True)


def flush() -> None:
    """Flush the Langfuse client if available. No-op otherwise."""
    client = get_langfuse()
    if client is not None:
        try:
            client.flush()
        except Exception:
            logger.debug("Langfuse flush failed", exc_info=True)


# ---------------------------------------------------------------------------
# 2b. Thread propagation — capture / apply trace context across threads
# ---------------------------------------------------------------------------
def get_trace_context() -> tuple[str | None, str | None]:
    """Capture current Langfuse trace + observation IDs for thread propagation.

    ``@observe`` decorators use OTel thread-local context that
    ``ThreadPoolExecutor`` threads don't inherit. Call this *before*
    ``executor.submit()`` and pass the result to :func:`apply_trace_context`
    inside the child callable.

    Uses the v4 ``Langfuse`` client methods (``langfuse_context`` was removed
    in v4).
    """
    client = get_langfuse()
    if client is None:
        return None, None
    try:
        return (
            client.get_current_trace_id(),
            client.get_current_observation_id(),
        )
    except Exception:
        return None, None


def apply_trace_context(
    trace_id: str | None,
    observation_id: str | None,
) -> None:
    """Re-establish Langfuse trace context in a child thread.

    In v4, cross-thread propagation uses ``start_as_current_observation``
    with ``trace_context`` to join the existing trace tree. The child
    observation becomes a sibling under the same trace.
    """
    if not trace_id:
        return
    client = get_langfuse()
    if client is None:
        return
    try:
        client.start_as_current_observation(
            name="thread-propagated",
            trace_context={"trace_id": trace_id, "parent_span_id": observation_id},
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 3. Prompt management — fetch from Langfuse with local fallback
# ---------------------------------------------------------------------------
_prompt_cache: dict[str, str] = {}


def get_prompt(name: str, *, fallback: str) -> str:
    """Fetch a text prompt from Langfuse Prompt Management (cached per process).

    Langfuse prompts use ``{{var}}`` placeholders; this converts to Python
    ``{var}`` format strings for ``str.format()`` compatibility.

    Args:
        name: Langfuse prompt name (e.g. ``"rag-evidence-answer"``).
        fallback: Local prompt string to use if Langfuse is unavailable.

    Returns:
        Prompt template string with ``{var}`` placeholders.
    """
    if name in _prompt_cache:
        return _prompt_cache[name]

    client = get_langfuse()
    if client is not None:
        try:
            prompt_obj = client.get_prompt(name, label="production")
            text = re.sub(r"\{\{(\w+)\}\}", r"{\1}", prompt_obj.prompt)
            _prompt_cache[name] = text
            logger.info(
                "Loaded prompt '%s' from Langfuse (v%s)", name, prompt_obj.version
            )
            return text
        except Exception:
            logger.warning(
                "Could not fetch prompt '%s' from Langfuse, using fallback", name
            )

    _prompt_cache[name] = fallback
    return fallback


# ---------------------------------------------------------------------------
# 4. REST API helper — for features not yet in the Python SDK
# ---------------------------------------------------------------------------


def langfuse_api(method: str, path: str, json_body: dict | None = None) -> dict | None:
    """Call the Langfuse REST API directly.

    Handles auth, base URL, and error suppression. Returns parsed JSON or
    ``None`` on failure. ``path`` should start with ``/`` and is appended to
    ``/api/public``.
    """
    import httpx

    base_url = os.environ.get("LANGFUSE_BASE_URL", "http://localhost:3100")
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "")

    url = f"{base_url}/api/public{path}"
    try:
        resp = httpx.request(
            method,
            url,
            json=json_body,
            auth=(public_key, secret_key),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json() if resp.content else None
    except Exception:
        logger.debug("Langfuse API call failed: %s %s", method, path, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 5. Span naming registry — single source of truth for all @observe names
# ---------------------------------------------------------------------------
# Convention: domain.subdomain.operation
# Every @observe(name=...) MUST reference a constant from this block.

# RAG pipeline spans
SPAN_RAG_SEARCH = "rag.search"
SPAN_RAG_EXECUTE = "rag.execute"
SPAN_RAG_RETRIEVE = "rag.retrieve"
SPAN_RAG_FINALIZE = "rag.finalize"
SPAN_RAG_ANSWER = "rag.answerGeneration"
SPAN_RAG_GROUNDED = "rag.groundedAnswer"

# Graph build spans
SPAN_GRAPH_BUILD_RUN = "graph.build.run"
SPAN_GRAPH_BUILD_VECTORS = "graph.build.ensureInputVectors"
SPAN_GRAPH_BUILD_LAYOUT_MATRIX = "graph.build.ensureLayoutMatrix"
SPAN_GRAPH_BUILD_KNN = "graph.build.ensureSharedKnn"
SPAN_GRAPH_BUILD_COORDS = "graph.build.ensureLayoutCoordinates"
SPAN_GRAPH_BUILD_CLUSTERS = "graph.build.ensureClusterIds"
SPAN_GRAPH_BUILD_SCORED = "graph.build.ensureScoredCoordinates"
SPAN_GRAPH_BUILD_PUBLISH = "graph.build.publishGraphRun"
SPAN_GRAPH_BUILD_WRITE_POINTS = "graph.build.writeGraphPoints"
SPAN_GRAPH_BUILD_WRITE_CLUSTERS = "graph.build.writeGraphClusters"

# Cluster labeling spans
SPAN_GRAPH_LABEL_BATCH = "graph.clusterLabeling.labelBatch"
SPAN_GRAPH_LABEL_CONTEXT = "graph.clusterLabeling.loadContext"
SPAN_GRAPH_LABEL_CLUSTERS = "graph.clusterLabeling.labelClusters"
SPAN_GRAPH_LABEL_RELABEL = "graph.clusterLabeling.relabel"

# Graph layout spans
SPAN_GRAPH_LAYOUT_PREPROCESS = "graph.layout.preprocess"
SPAN_GRAPH_LAYOUT_PCA = "graph.layout.pca"
SPAN_GRAPH_LAYOUT_RUN = "graph.layout.run"

# Graph cluster algorithm spans
SPAN_GRAPH_CLUSTERS_LEIDEN = "graph.clusters.leiden"
SPAN_GRAPH_CLUSTERS_CUGRAPH = "graph.clusters.cugraphLeiden"
SPAN_GRAPH_CLUSTERS_GPU_KNN = "graph.clusters.leidenGpuFromKnn"

# Ingest spans
SPAN_INGEST_REFRESH = "ingest.ragRefresh"
SPAN_INGEST_BIOCXML_API = "ingest.biocxmlApi"
SPAN_INGEST_BIOC_ARCHIVE = "ingest.biocArchive"

# Export spans
SPAN_EXPORT_VIEWS = "graph.export.materializeViews"
SPAN_EXPORT_BUNDLE = "graph.export.bundle"

# Graph misc spans
SPAN_GRAPH_ATTACHMENT = "graph.attachment.resolve"
SPAN_GRAPH_EVIDENCE = "graph.evidence.refresh"


# ---------------------------------------------------------------------------
# 6. Score name constants — must match RAG_SCORE_CONFIGS in eval_langfuse.py
# ---------------------------------------------------------------------------

# Retrieval metrics
SCORE_HIT_AT_1 = "hit_at_1"
SCORE_HIT_AT_K = "hit_at_k"
SCORE_MRR = "mrr"

# Answer quality
SCORE_GROUNDED_ANSWER_RATE = "grounded_answer_rate"
SCORE_GROUNDED_ANSWER_PRESENT = "grounded_answer_present"
SCORE_TARGET_IN_GROUNDED = "target_in_grounded_answer"
SCORE_TARGET_IN_CORPUS = "target_in_answer_corpus"
SCORE_FAITHFULNESS = "faithfulness"

# Runtime
SCORE_DURATION_MS = "duration_ms"
SCORE_EVIDENCE_BUNDLE_COUNT = "evidence_bundle_count"

# Categorical
# NOTE: When querying categorical scores via the Langfuse API/SDK, always
# read ``stringValue`` — the numeric ``value`` field is always 0 for
# categorical scores because the SDK doesn't compute the category index
# client-side. ``route_signature`` was removed in favor of reading the full
# signature from observation metadata (``session_flags.route_signature``).
SCORE_RETRIEVAL_PROFILE = "retrieval_profile"
SCORE_WAREHOUSE_DEPTH = "warehouse_depth"

# Graph build
SCORE_GRAPH_POINT_COUNT = "graph_point_count"
SCORE_GRAPH_CLUSTER_COUNT = "graph_cluster_count"
SCORE_GRAPH_BUNDLE_BYTES = "graph_bundle_bytes"
SCORE_GRAPH_BUILD_DURATION_S = "graph_build_duration_s"

# Graph cluster labeling
SCORE_GRAPH_CLUSTER_LABELED = "graph_cluster_labeled_count"
SCORE_GRAPH_CLUSTER_ERRORS = "graph_cluster_error_count"
SCORE_GRAPH_CLUSTER_TOTAL = "graph_cluster_total"

# Ingest quality
SCORE_SECTION_COUNT = "section_count"
SCORE_BLOCK_COUNT = "block_count"
SCORE_SENTENCE_COUNT = "sentence_count"
SCORE_ENTITY_COUNT = "entity_count"
SCORE_HAS_ABSTRACT = "has_abstract_section"
SCORE_HAS_TITLE = "has_title_section"
SCORE_SOURCE_AVAILABILITY = "source_availability"
SCORE_SOURCE_SYSTEM = "source_system"
