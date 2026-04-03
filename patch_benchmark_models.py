import re

models_file = "engine/app/rag_ingest/runtime_eval_models.py"

with open(models_file, "r") as f:
    content = f.read()

# Add GENERAL_GLOBAL to RuntimeEvalQueryFamily
if "GENERAL_GLOBAL" not in content:
    content = content.replace(
        "    SENTENCE_GLOBAL = \"sentence_global\"",
        "    SENTENCE_GLOBAL = \"sentence_global\"\n    GENERAL_GLOBAL = \"general_global\""
    )

with open(models_file, "w") as f:
    f.write(content)
