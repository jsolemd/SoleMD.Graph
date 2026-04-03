import re

perf_file = "engine/test/test_rag_runtime_perf.py"

with open(perf_file, "r") as f:
    content = f.read()

perf_tests = """
@pytest.mark.integration
@pytest.mark.slow
def test_runtime_neuropsychiatry_hard_benchmark_remains_grounded_and_bounded():
    report = _runtime_benchmark_report("neuropsychiatry_v1")
    overall = report.summary.overall

    assert overall.error_count == 0
    assert overall.hit_at_k_rate >= 0.8
    assert overall.grounded_answer_rate >= 0.8
    assert overall.target_in_grounded_answer_rate >= 0.8
    assert overall.over_1000ms_count == 0
    assert overall.p95_service_duration_ms <= 800.0

@pytest.mark.integration
@pytest.mark.slow
def test_runtime_neuropsychiatry_hard_benchmark_excludes_retracted():
    report = _runtime_benchmark_report("neuropsychiatry_v1")
    for case in report.cases:
        assert case.session_flags.get("exclude_retracted") is not False

"""

if "test_runtime_neuropsychiatry_hard_benchmark" not in content:
    content += "\n\n" + perf_tests
    with open(perf_file, "w") as f:
        f.write(content)

print("Updated perf tests.")
