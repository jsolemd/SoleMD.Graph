import re

plan_file = "engine/app/rag/search_plan.py"

with open(plan_file, "r") as f:
    content = f.read()

hard_gates = """
    exclude_retracted: bool = True
    exclude_outdated_guidelines: bool = False
    require_human_evidence: bool = False
"""

if "exclude_retracted: bool" not in content:
    content = content.replace(
        "    selected_context_bonus: float",
        "    selected_context_bonus: float\n" + hard_gates
    )

    # Inject these values into the constructor calls
    replacements = [
        ("selected_context_bonus=1.0 if has_selected_context else 0.0,",
         "selected_context_bonus=1.0 if has_selected_context else 0.0,\n            exclude_retracted=True,\n            exclude_outdated_guidelines=False,\n            require_human_evidence=False,"),
        ("selected_context_bonus=0.55 if has_selected_context else 0.0,",
         "selected_context_bonus=0.55 if has_selected_context else 0.0,\n            exclude_retracted=True,\n            exclude_outdated_guidelines=False,\n            require_human_evidence=False,"),
        ("selected_context_bonus=0.0,",
         "selected_context_bonus=0.0,\n        exclude_retracted=True,\n        exclude_outdated_guidelines=False,\n        require_human_evidence=False,")
    ]

    for old, new in replacements:
        content = content.replace(old, new)

with open(plan_file, "w") as f:
    f.write(content)

print("Updated search_plan.py")
