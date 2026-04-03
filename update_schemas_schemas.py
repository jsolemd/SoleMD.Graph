import re

schemas_file = "engine/app/rag/schemas.py"

with open(schemas_file, "r") as f:
    content = f.read()

# Add new fields to GroundedAnswer and RagSearchResponse
# First we need to import AnswerState in schemas.py
if "AnswerState" not in content:
    content = content.replace("RetrievalChannel,", "RetrievalChannel,\n    AnswerState,")

pico_schema = """
class QueryPicoAnalysis(RagSchema):
    \"\"\"Explicit representation of population, intervention, comparator, and outcome.\"\"\"
    population: list[str] = Field(default_factory=list)
    intervention: list[str] = Field(default_factory=list)
    comparator: list[str] = Field(default_factory=list)
    outcome: list[str] = Field(default_factory=list)

class ClaimAttribution(RagSchema):
    \"\"\"Claim-level citation verification.\"\"\"
    claim_text: str
    supported: bool
    cited_span_ids: list[str] = Field(default_factory=list)

"""

if "QueryPicoAnalysis" not in content:
    # Insert before GroundedAnswer
    content = re.sub(
        r'(class GroundedAnswer\(RagSchema\):)',
        pico_schema + r'\1',
        content
    )

if "answer_state" not in content:
    content = re.sub(
        r'(class RagSearchResponse\(RagSchema\):\n.*?answer_model: str \| None = None\n)',
        r'\1    answer_state: AnswerState | None = None\n    pico_analysis: QueryPicoAnalysis | None = None\n    claim_attributions: list[ClaimAttribution] = Field(default_factory=list)\n',
        content,
        flags=re.DOTALL
    )

with open(schemas_file, "w") as f:
    f.write(content)

print("Updated schemas.py")
