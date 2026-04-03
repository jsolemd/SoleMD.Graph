from engine.app.rag.search_plan import build_search_plan, RetrievalSearchPlan
import dataclasses
fields = {f.name for f in dataclasses.fields(RetrievalSearchPlan)}
assert "exclude_retracted" in fields
print("exclude_retracted exists in RetrievalSearchPlan")
