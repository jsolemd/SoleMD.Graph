"""Configuration for SoleMD.Graph engine."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Engine settings, loaded from environment variables."""

    # Database
    database_url: str = "postgresql://solemd:solemd_local@localhost:5433/solemd_graph"

    # Redis (for Dramatiq task queue)
    redis_url: str = "redis://localhost:6380/0"

    # Data directories
    data_dir: str = "data"
    pubtator_dir: str = "data/pubtator"
    semantic_scholar_dir: str = "data/semantic-scholar"

    # Semantic Scholar API
    s2_api_key: str = ""
    s2_api_base: str = "https://api.semanticscholar.org"

    # PubTator3 FTP
    pubtator_ftp_base: str = "https://ftp.ncbi.nlm.nih.gov/pub/lu/PubTator3"

    # LLM (for cluster labeling)
    gemini_api_key: str = ""
    openai_api_key: str = ""

    model_config = {"env_file": "../.env.local", "extra": "ignore"}


settings = Settings()
