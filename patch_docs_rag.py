import re

rag_file = "docs/map/rag-architecture.md"

with open(rag_file, "r") as f:
    content = f.read()

matrix_table = """
### State Matrix: Current vs Target

| Capability | Live Default | Live Optional | Planned | Rejected |
| --- | --- | --- | --- | --- |
| Answer Generation | Extractive Baseline | None | Gemini Synthesized | Direct LLM DB Querying |
| Reranking | Lexical/Dense fusion | MedCPT | Evidence-tier / EBM | Always-on LLM-as-a-judge |
| Answer State | Prose + citations | None | Explicit (Supported, Mixed) | Undifferentiated |
| Citation Granularity | Document & chunk | None | Claim-to-span | Document-only |

"""

model_matrix = """
## Model-Role Matrix

| Role | Model Assignment | Justification |
| --- | --- | --- |
| Graph Geometry | UMAP (local via DuckDB) | Stable layout generation offline. |
| Paper Dense Retrieval | SPECTER2 | Aligned to scientific document space, ad-hoc search adapters. |
| Passage Retrieval | SPECTER2 (fallback) / Lexical | Sentence queries need lexical exactness. |
| Reranking | MedCPT | Contrastively trained biomedical expert for top-N ranking. |
| Autocomplete | Local DuckDB FTS | Zero-latency browser requirement. |
| Synthesis | Gemini 2.5 Flash | Fast streaming, context window, strong citation instruction-following. |

"""

safety_contract = """
## Clinical Safety Contract

1. **Retracted Papers:** Strictly excluded at the database retrieval level (`exclude_retracted=True`).
2. **Outdated Guidelines:** Support for explicit hard gating to prevent legacy clinical guidance from appearing as truth.
3. **Nonhuman Evidence:** Can be gated explicitly via search plans; explicitly labeled in answer state (`nonhuman-only`).
4. **Insufficient Grounding:** Explicit abstention when claims cannot be traced back to warehouse spans (`insufficient`).
5. **Mixed/Contradictory:** Emits `mixed` answer state rather than smoothing over conflicting evidence.
"""

invariants = """
## Appendix: Invariants

1. **Ranking Centralization:** All channel rankings collapse through reciprocal rank fusion in one place.
2. **Single Search-Session Policy:** Pinned PostgreSQL connection with query-profile tuned execution parameters.
3. **One Primary Structural Source:** S2ORC is the canonical structural spine; BioC provides entity overlays.
4. **Coverage-Gated Grounding:** Extractive answers upgrade to grounded answers only if the chunk version and warehouse coverage exist.
5. **One Runtime-Eval Entrypoint:** `run_rag_runtime_evaluation` runs the exact live service code path.
6. **One Benchmark Loader:** Immutable query test cases bound to semantic domains like neuropsychiatry.
7. **One Route-Signature Registry:** Instrumentation flags trace exact retrieval pathways for performance regressions.
"""

if "State Matrix: Current vs Target" not in content:
    content = re.sub(
        r'(## 1. Executive Summary\n)',
        r'\1\n' + matrix_table,
        content
    )

if "Model-Role Matrix" not in content:
    content = re.sub(
        r'(## 20. Biomedical Model Roles\n)',
        r'\1\n' + model_matrix,
        content
    )

if "Clinical Safety Contract" not in content:
    content = re.sub(
        r'(## 23. Grounded Answer Architecture\n)',
        r'\1\n' + safety_contract,
        content
    )

if "Appendix: Invariants" not in content:
    content = content + "\n\n" + invariants


with open(rag_file, "w") as f:
    f.write(content)
