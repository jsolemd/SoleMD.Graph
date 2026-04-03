import sys

def check_file_length(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        if len(lines) > 600:
            print(f"{filepath} is {len(lines)} lines long. Needs splitting.")
            return True
    return False

files_to_check = [
    "engine/app/rag_ingest/orchestrator.py",
    "engine/app/rag/queries.py",
    "engine/app/rag_ingest/chunking.py",
    "engine/app/rag_ingest/source_parsers.py",
    "engine/app/rag_ingest/narrative_structure.py",
    "engine/app/rag_ingest/write_repository.py",
    "engine/app/rag_ingest/orchestrator_units.py",
    "engine/app/rag/warehouse_grounding.py",
    "engine/app/rag/query_enrichment.py"
]

for f in files_to_check:
    check_file_length(f)
