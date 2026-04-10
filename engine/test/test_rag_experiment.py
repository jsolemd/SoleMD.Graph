from __future__ import annotations

from types import SimpleNamespace

from pydantic import BaseModel, ConfigDict

from app.rag_ingest.experiment import _strip_dataset_item_metadata


class FrozenItem(BaseModel):
    input: dict[str, str]
    metadata: dict[str, str] | None = None
    id: str = "item-1"
    dataset_id: str = "dataset-1"

    model_config = ConfigDict(frozen=True)


def test_strip_dataset_item_metadata_clears_dict_object_and_frozen_sdk_items():
    dataset = SimpleNamespace(
        items=[
            {"metadata": {"qf": "title_global"}, "input": {"query": "a"}},
            SimpleNamespace(metadata={"qf": "sentence_global"}, input={"query": "b"}),
            FrozenItem(input={"query": "frozen"}, metadata={"qf": "title_selected"}),
            SimpleNamespace(input={"query": "c"}),
        ]
    )

    stripped_items = _strip_dataset_item_metadata(dataset)

    assert dataset.items[0]["metadata"] is None
    assert dataset.items[1].metadata is None
    assert dataset.items[2].metadata is None
    assert stripped_items is dataset.items
    assert not hasattr(dataset.items[3], "metadata")
