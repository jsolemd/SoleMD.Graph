from __future__ import annotations

from prometheus_client.parser import text_string_to_metric_families

from app.telemetry.metrics import collect_metrics_text


def metric_sample_value(metric_name: str, labels: dict[str, str] | None = None) -> float:
    labels = labels or {}
    for family in text_string_to_metric_families(collect_metrics_text()):
        for sample in family.samples:
            if sample.name != metric_name:
                continue
            if sample.labels != labels:
                continue
            return float(sample.value)
    return 0.0
