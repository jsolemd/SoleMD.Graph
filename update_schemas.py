import re

types_file = "engine/app/rag/types.py"

with open(types_file, "r") as f:
    content = f.read()

# Add AnswerState
answer_state_enum = """
class AnswerState(StrEnum):
    \"\"\"Explicit answer states representing the consensus of evidence.\"\"\"

    SUPPORTED = "supported"
    MIXED = "mixed"
    INSUFFICIENT = "insufficient"
    NONHUMAN_ONLY = "nonhuman-only"
    OUTDATED = "outdated"
    WAREHOUSE_INCOMPLETE = "warehouse-incomplete"

"""

if "AnswerState" not in content:
    # Insert after NodeLayer
    content = re.sub(
        r'(class NodeLayer\(StrEnum\):.*?)(?=\n\nclass)',
        r'\1\n' + answer_state_enum,
        content,
        flags=re.DOTALL
    )
    with open(types_file, "w") as f:
        f.write(content)
    print("Added AnswerState to types.py")
