import re

benchmarks_file = "engine/app/rag_ingest/runtime_eval_benchmarks.py"

with open(benchmarks_file, "r") as f:
    content = f.read()

neuropsych_cases = """
def load_neuropsychiatry_hard_cases() -> list[RuntimeEvalQueryCase]:
    \"\"\"Domain-shaped hard cases for clinical neuropsychiatry evaluation.\"\"\"
    raw_queries = [
        "delirium versus primary psychosis",
        "catatonia diagnostic criteria and management",
        "lithium with renal and cardiac comorbidity",
        "SSRI induced hyponatremia risk factors",
        "Neuroleptic Malignant Syndrome NMS presentation",
        "serotonin syndrome differentiation",
        "autoimmune encephalitis psychiatric presentation",
        "dementia behavioral syndromes and agitation",
        "pregnancy and lactation psychopharmacology safety"
    ]

    return [
        RuntimeEvalQueryCase(
            corpus_id=0, # Abstract corpus id for static query test
            title="Domain Benchmark Target",
            primary_source_system="synthetic",
            query_family=RuntimeEvalQueryFamily.GENERAL_GLOBAL,
            query=query,
            stratum_key="benchmark:neuropsychiatry_v1",
            benchmark_labels=["domain_specific", "neuropsychiatry", "clinical_hard"],
        )
        for query in raw_queries
    ]
"""

# Let's ensure RuntimeEvalQueryFamily has GENERAL_GLOBAL
# The schema models file is `runtime_eval_models.py`, which we might need to modify or just use an existing query family.
