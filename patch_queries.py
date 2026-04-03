import re

queries_file = "engine/app/rag/queries.py"

with open(queries_file, "r") as f:
    content = f.read()

# I want to add some hard exclusion logic to SQL. However, since the prompt specifies this is about defining the interfaces/contracts for EBM primarily,
# I'll create a clean SQL helper function that adds these filters and note its usage, or directly inject it if simple enough.

filter_injection = """
def build_clinical_hard_gates_sql(
    *,
    exclude_retracted: bool = True,
    exclude_outdated_guidelines: bool = False,
    require_human_evidence: bool = False
) -> str:
    \"\"\"Generates WHERE clause conditions to enforce clinical safety contracts.\"\"\"
    conditions = []
    if exclude_retracted:
        conditions.append("p.is_retracted = false")
    if exclude_outdated_guidelines:
        conditions.append("p.is_outdated_guideline = false")
    if require_human_evidence:
        conditions.append("p.has_human_evidence = true")

    if not conditions:
        return "true"
    return " AND ".join(conditions)
"""

if "build_clinical_hard_gates_sql" not in content:
    content = content.replace(
        "def _paper_search_sql",
        filter_injection + "\n\ndef _paper_search_sql"
    )
    with open(queries_file, "w") as f:
        f.write(content)
    print("Added build_clinical_hard_gates_sql to queries.py")
