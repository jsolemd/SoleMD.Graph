import ast
import os
from collections import defaultdict

def analyze_file(filepath):
    with open(filepath, "r") as f:
        tree = ast.parse(f.read())

    classes = [node.name for node in tree.body if isinstance(node, ast.ClassDef)]
    functions = [node.name for node in tree.body if isinstance(node, ast.FunctionDef)]

    print(f"File: {filepath}")
    print(f"  Classes: {len(classes)}")
    print(f"  Functions: {len(functions)}")

analyze_file("engine/app/rag/queries.py")
analyze_file("engine/app/rag_ingest/orchestrator.py")
analyze_file("engine/app/rag_ingest/chunking.py")
analyze_file("engine/app/rag_ingest/source_parsers.py")
