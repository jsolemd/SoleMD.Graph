# Critical Appraisal & EBM Roadmap

## 1. Current State Evaluation
The existing RAG pipeline is built on a highly rigorous and disciplined foundation. The `paper-first` identity substrate with `chunk-backed` grounding perfectly aligns with minimizing provenance drift. The boundary where the backend dictates evidence and DuckDB handles local resolution effectively isolates the graph frontend from complex query planning overhead.

## 2. Gaps & Structural Interventions
The core gap to clinician-grade readiness lies in **Evidence-Based Medicine (EBM) alignment**.

### 2.1 PICO Slot Extraction and Intent Routing
**Current:** We have coarse clinical intents (`general`, `treatment`, `diagnosis`, `mechanism`) inferred from rules.
**Recommendation:** We have added `QueryPicoAnalysis` to the schema contracts. We should leverage the existing Gemini 2.5 Flash model during the inference phase to extract (Population, Intervention, Comparator, Outcome) slots prior to executing the `execute_search` loop. Passing these explicit PICO terms into the lexical and dense query builders will substantially improve entity-level recall.

### 2.2 Answer States & Abstention
**Current:** Emits an undifferentiated text stream if any answer can be formulated.
**Recommendation:** The `AnswerState` enum (`supported`, `mixed`, `insufficient`, `nonhuman-only`, `outdated`) was integrated into the response contract. Synthesis gates should check for conflicting vector polarities in the selected chunks. If high cosine-similarity chunks express contradictory findings, the system should forcefully downgrade the response to `mixed` instead of smoothing the conflict.

### 2.3 Claim-Level Citation Verification
**Current:** Checks if target papers appear in grounded spans (`target_in_grounded_answer`).
**Recommendation:** `ClaimAttribution` was added to schemas. We recommend introducing a post-retrieval verification pass using an external lightweight model (e.g. cross-encoder or structured LLM call) to assert that `claim_text` strictly follows from `cited_span_ids`. If `supported == False`, the claim is removed prior to streaming.

### 2.4 Model Stack Evaluation
- **SPECTER2:** Highly appropriate for dense paper retrieval due to its training on citation graphs and document-level embeddings.
- **MedCPT:** Strong recommendation to keep this as the primary biomedical reranker, but we suggest exposing the reranker thresholds dynamically based on query profile. For clinician intents (`treatment`, `diagnosis`), MedCPT should be default-ON, trading ~75ms for high-precision EBM sorting.
- **Gemini 2.5 Flash:** Fits the synthesis role well due to large context and speed. Its instruction-following is sufficient for PICO extraction and claim formatting without adding latency from slower reasoning models.

## 3. The Path Forward
The codebase is structurally prepared to ingest these updates. The `RetrievalSearchPlan` now handles hard EBM gates (excluding retractions and outdated guidelines), and the `schemas.py` contracts enforce the strict response boundaries needed to start wiring the LLM logic into `answer.py`.
