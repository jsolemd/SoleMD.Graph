from __future__ import annotations

from app.rag.query_plan import plan_hash, plan_index_names, plan_node_names


def test_plan_helpers_walk_nested_nodes_and_indexes():
    plan = {
        "Node Type": "Limit",
        "Plans": [
            {
                "Node Type": "Index Scan",
                "Index Name": "idx_one",
                "Plans": [
                    {
                        "Node Type": "Bitmap Heap Scan",
                        "Plans": [
                            {
                                "Node Type": "Bitmap Index Scan",
                                "Index Name": "idx_two",
                            }
                        ],
                    }
                ],
            }
        ],
    }

    assert plan_node_names(plan) == [
        "Limit",
        "Index Scan",
        "Bitmap Heap Scan",
        "Bitmap Index Scan",
    ]
    assert plan_index_names(plan) == ["idx_one", "idx_two"]


def test_plan_hash_is_stable_for_key_order():
    plan_a = {"Node Type": "Index Scan", "Index Name": "idx_one", "Plans": []}
    plan_b = {"Plans": [], "Index Name": "idx_one", "Node Type": "Index Scan"}

    assert plan_hash(plan_a) == plan_hash(plan_b)
