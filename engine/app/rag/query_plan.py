"""Helpers for inspecting PostgreSQL JSON execution plans."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any


def plan_node_names(plan: Mapping[str, Any]) -> list[str]:
    names = [str(plan.get("Node Type", ""))]
    for child in plan.get("Plans", []) or []:
        if isinstance(child, Mapping):
            names.extend(plan_node_names(child))
    return names


def plan_index_names(plan: Mapping[str, Any]) -> list[str]:
    names: list[str] = []
    index_name = plan.get("Index Name")
    if index_name:
        names.append(str(index_name))
    for child in plan.get("Plans", []) or []:
        if isinstance(child, Mapping):
            names.extend(plan_index_names(child))
    return names


def plan_hash(plan: Mapping[str, Any]) -> str:
    encoded = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(encoded).hexdigest()
