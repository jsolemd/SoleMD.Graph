from engine.app.rag.search_plan import build_search_plan, RetrievalSearchPlan
from engine.app.rag.models import PaperRetrievalQuery
from engine.app.rag.types import QueryRetrievalProfile, RetrievalScope
q = PaperRetrievalQuery(
    raw_query="test",
    normalized_query="test",
    use_lexical=True,
    use_dense_query=True,
    generate_answer=True,
    k=10,
    rerank_topn=50,
    retrieval_profile=QueryRetrievalProfile.GENERAL,
    scope_mode=RetrievalScope.GLOBAL
)
plan = build_search_plan(q)
assert plan.exclude_retracted == True
print("Plan instantiated successfully with hard gates.")
