from engine.app.rag_ingest.runtime_eval_benchmarks import load_neuropsychiatry_hard_cases

cases = load_neuropsychiatry_hard_cases()
assert len(cases) == 9
print("Neuropsychiatry benchmarks generated successfully.")
