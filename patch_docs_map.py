import re

map_file = "docs/map/map.md"

with open(map_file, "r") as f:
    content = f.read()

table = """
### State Matrix: Current vs Target

| Capability | Live Default | Live Optional | Planned | Rejected |
| --- | --- | --- | --- | --- |
| Answer Generation | Extractive Baseline | None | Gemini Synthesized | Direct LLM DB Querying |
| Reranking | Lexical/Dense fusion | MedCPT | Evidence-tier / EBM | Always-on LLM-as-a-judge |
| Answer State | Prose + citations | None | Explicit (Supported, Mixed) | Undifferentiated |
| Citation Granularity | Document & chunk | None | Claim-to-span | Document-only |

"""

if "State Matrix: Current vs Target" not in content:
    content = re.sub(
        r'(## 1. Executive Summary\n)',
        r'\1\n' + table,
        content
    )
    with open(map_file, "w") as f:
        f.write(content)
