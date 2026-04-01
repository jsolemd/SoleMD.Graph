"""Configuration for SoleMD.Graph engine."""

from pathlib import Path

from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Engine settings, loaded from environment variables."""

    # Database — default is intentionally local-dev-only; override via DATABASE_URL in .env.local
    database_url: str = "postgresql://solemd:solemd_local@localhost:5433/solemd_graph"

    # Redis (for Dramatiq task queue)
    redis_url: str = "redis://localhost:6380/0"

    # Data directories
    data_dir: str = "data"
    graph_dir: str = "/mnt/solemd-graph"
    pubtator_dir: str = "data/pubtator"
    semantic_scholar_dir: str = "data/semantic-scholar"

    # Semantic Scholar API
    s2_api_key: str = ""
    s2_api_base: str = "https://api.semanticscholar.org"
    s2_release_id: str = ""
    pubtator_release_id: str = ""

    # RAG ingest NLP
    rag_stanza_use_gpu: bool = True

    # Runtime RAG retrieval
    rag_semantic_neighbor_ann_enabled: bool = True
    rag_semantic_neighbor_hnsw_ef_search: int = 100
    rag_semantic_neighbor_candidate_multiplier: int = 20
    rag_semantic_neighbor_min_candidates: int = 120
    rag_semantic_neighbor_max_candidates: int = 3840
    rag_semantic_neighbor_hnsw_max_scan_tuples: int = 20000
    rag_semantic_neighbor_exact_parallel_workers: int = 4
    rag_runtime_exact_graph_search_max_papers: int = 5000
    rag_runtime_broad_scope_ann_min_ratio: float = 0.95
    rag_dense_query_enabled: bool = True
    rag_dense_query_use_gpu: bool = True
    rag_dense_query_base_model: str = "allenai/specter2_base"
    rag_dense_query_adapter_name: str = "allenai/specter2_adhoc_query"
    rag_dense_query_max_length: int = 512
    rag_model_cache_dir: str = "data/huggingface"

    # DuckDB (for citations pipeline and heavy in-memory queries)
    duckdb_memory_limit: str = "8GB"

    # Graph build
    graph_layout_backend: str = "auto"
    graph_cluster_backend: str = "auto"
    graph_cluster_resolution: float = 3.0
    graph_pca_method: str = "sparse_random_projection"  # or "incremental_pca"
    graph_embedding_fetch_batch_size: int = 5000
    graph_label_sample_per_cluster: int = 200

    # OpenAlex / ROR affiliation enrichment
    openalex_api_key: str = ""
    openalex_mailto: str = ""
    ror_client_id: str = ""

    # PubTator3 FTP
    pubtator_ftp_base: str = "https://ftp.ncbi.nlm.nih.gov/pub/lu/PubTator3"

    # LLM (for cluster labeling)
    gemini_api_key: str = ""
    openai_api_key: str = ""

    model_config = {"env_file": "../.env.local", "extra": "ignore"}

    def validate_for_enrichment(self) -> None:
        """Raise ValueError if enrichment settings are missing."""
        if not self.s2_api_key:
            raise ValueError("S2_API_KEY is required for enrichment. Set it in .env.local")

    def validate_for_graph_build(self) -> None:
        """Raise ValueError if graph build settings are missing."""
        if not self.database_url:
            raise ValueError("DATABASE_URL is required. Set it in .env.local")

    def _resolve_project_path(self, value: str | Path) -> Path:
        """Resolve repo-relative data paths against the project root."""
        path = Path(value).expanduser()
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path.resolve(strict=False)

    @property
    def project_root_path(self) -> Path:
        return PROJECT_ROOT

    @property
    def data_root_path(self) -> Path:
        return self._resolve_project_path(self.data_dir)

    @property
    def graph_root_path(self) -> Path:
        return self._resolve_project_path(self.graph_dir)

    @property
    def graph_bundles_root_path(self) -> Path:
        return self.graph_root_path / "bundles"

    @property
    def graph_manifests_root_path(self) -> Path:
        return self.graph_root_path / "manifests"

    @property
    def graph_logs_root_path(self) -> Path:
        return self.graph_root_path / "logs"

    @property
    def graph_tmp_root_path(self) -> Path:
        return self.graph_root_path / "tmp"

    @property
    def pubtator_root_path(self) -> Path:
        return self._resolve_project_path(self.pubtator_dir)

    @property
    def pubtator_releases_root_path(self) -> Path:
        return self.pubtator_root_path / "releases"

    def pubtator_release_path(self, release_id: str | None = None) -> Path:
        resolved = release_id or self.pubtator_release_id
        if not resolved:
            raise ValueError(
                "PubTator release id required: pass release_id or set PUBTATOR_RELEASE_ID"
            )
        return self.pubtator_releases_root_path / resolved

    @property
    def pubtator_source_dir_path(self) -> Path:
        return self.pubtator_release_path()

    @property
    def pubtator_entities_path(self) -> Path:
        return self.pubtator_source_dir_path / "bioconcepts2pubtator3.gz"

    @property
    def pubtator_relations_path(self) -> Path:
        return self.pubtator_source_dir_path / "relation2pubtator3.gz"

    @property
    def pubtator_biocxml_dir_path(self) -> Path:
        return self.pubtator_source_dir_path / "biocxml"

    @property
    def semantic_scholar_root_path(self) -> Path:
        return self._resolve_project_path(self.semantic_scholar_dir)

    @property
    def semantic_scholar_releases_root_path(self) -> Path:
        return self.semantic_scholar_root_path / "releases"

    def semantic_scholar_release_path(self, release_id: str | None = None) -> Path:
        resolved = release_id or self.s2_release_id
        if not resolved:
            raise ValueError(
                "Semantic Scholar release id required: pass release_id or set S2_RELEASE_ID"
            )
        return self.semantic_scholar_releases_root_path / resolved

    def semantic_scholar_dataset_path(
        self,
        dataset_name: str,
        release_id: str | None = None,
    ) -> Path:
        return self.semantic_scholar_release_path(release_id) / dataset_name

    @property
    def semantic_scholar_papers_dir_path(self) -> Path:
        return self.semantic_scholar_dataset_path("papers")

    @property
    def semantic_scholar_abstracts_dir_path(self) -> Path:
        return self.semantic_scholar_dataset_path("abstracts")

    @property
    def semantic_scholar_tldrs_dir_path(self) -> Path:
        return self.semantic_scholar_dataset_path("tldrs")

    @property
    def semantic_scholar_citations_dir_path(self) -> Path:
        return self.semantic_scholar_dataset_path("citations")

    @property
    def semantic_scholar_authors_dir_path(self) -> Path:
        return self.semantic_scholar_dataset_path("authors")

    @property
    def semantic_scholar_paper_ids_dir_path(self) -> Path:
        return self.semantic_scholar_dataset_path("paper-ids")

    @property
    def semantic_scholar_s2orc_v2_dir_path(self) -> Path:
        return self.semantic_scholar_dataset_path("s2orc_v2")

    @property
    def vocab_aliases_path(self) -> Path:
        return self.data_root_path / "vocab_aliases.tsv"

    @property
    def vocab_terms_path(self) -> Path:
        return self.data_root_path / "vocab_terms.tsv"

    @property
    def nlm_journals_path(self) -> Path:
        return self.data_root_path / "nlm_neuro_psych_journals.json"

    @property
    def rag_model_cache_path(self) -> Path:
        return self._resolve_project_path(self.rag_model_cache_dir)


settings = Settings()
