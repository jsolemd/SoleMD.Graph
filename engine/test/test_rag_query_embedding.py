"""Unit tests for dense-query embedder health/status surfaces."""

from __future__ import annotations

import logging
import sys
from contextlib import nullcontext
from types import ModuleType, SimpleNamespace

from app.rag.query_embedding import NoopQueryEmbedder, Specter2AdhocQueryEmbedder


def test_noop_query_embedder_status_reports_no_active_adapter():
    status = NoopQueryEmbedder().runtime_status()

    assert status == {
        "enabled": False,
        "ready": True,
        "backend": "noop",
        "device": None,
        "active_adapters": None,
        "error": None,
    }


def test_specter2_query_embedder_status_exposes_active_adapters():
    class DummyModel:
        active_adapters = "Stack[[QRY]]"

    embedder = Specter2AdhocQueryEmbedder(
        base_model_name="allenai/specter2_base",
        adapter_name="allenai/specter2_adhoc_query",
        cache_dir="/tmp/hf-cache",
        max_length=512,
        use_gpu=True,
    )
    embedder._runtime = (object(), DummyModel(), "cuda:0")

    status = embedder.runtime_status()

    assert status["enabled"] is True
    assert status["ready"] is True
    assert status["backend"] == "specter2_adhoc_query"
    assert status["device"] == "cuda:0"
    assert status["active_adapters"] == "Stack[[QRY]]"
    assert status["error"] is None


def test_specter2_query_embedder_status_falls_back_to_active_setup():
    class DummyAdaptersConfig:
        active_setup = "Stack[[QRY]]"

    class DummyModel:
        active_adapters = None
        adapters_config = DummyAdaptersConfig()

    embedder = Specter2AdhocQueryEmbedder(
        base_model_name="allenai/specter2_base",
        adapter_name="allenai/specter2_adhoc_query",
        cache_dir="/tmp/hf-cache",
        max_length=512,
        use_gpu=True,
    )
    embedder._runtime = (object(), DummyModel(), "cuda:0")

    status = embedder.runtime_status()

    assert status["active_adapters"] == "Stack[[QRY]]"


def test_specter2_query_embedder_encode_relies_on_active_adapter_state(monkeypatch):
    calls: dict[str, object] = {}

    class FakeTensor:
        def to(self, device):
            calls["tensor_device"] = device
            return self

        def __getitem__(self, _key):
            return self

        def detach(self):
            return self

        def cpu(self):
            return self

        def tolist(self):
            return [0.25, 0.5, 0.75]

    class FakeTokenizer:
        def __call__(self, *_args, **_kwargs):
            return {"input_ids": FakeTensor()}

    class FakeModel:
        active_adapters = None
        adapters_config = SimpleNamespace(active_setup=None)

        def load_adapter(self, adapter_name, **kwargs):
            calls["load_adapter"] = (adapter_name, kwargs)
            return "QRY"

        def set_active_adapters(self, adapter_ref):
            calls["set_active_adapters"] = adapter_ref
            self.active_adapters = "Stack[[QRY]]"
            self.adapters_config.active_setup = "Stack[[QRY]]"

        def to(self, device):
            calls["model_device"] = device
            return self

        def eval(self):
            calls["eval_called"] = True

        def __call__(self, **encoded):
            calls["model_called"] = encoded
            return SimpleNamespace(last_hidden_state=FakeTensor())

    class RaisingAdapterSetup:
        def __init__(self, *_args, **_kwargs):
            raise AssertionError("AdapterSetup should not be used for SPECTER2 inference")

    fake_model = FakeModel()
    monkeypatch.setitem(
        sys.modules,
        "adapters",
        SimpleNamespace(
            AutoAdapterModel=SimpleNamespace(
                from_pretrained=lambda *args, **kwargs: fake_model
            ),
            AdapterSetup=RaisingAdapterSetup,
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "transformers",
        SimpleNamespace(
            AutoTokenizer=SimpleNamespace(
                from_pretrained=lambda *args, **kwargs: FakeTokenizer()
            )
        ),
    )
    torch_module = ModuleType("torch")
    torch_module.device = lambda name: name
    torch_module.cuda = SimpleNamespace(is_available=lambda: True)
    torch_module.inference_mode = lambda: nullcontext()
    torch_nn_module = ModuleType("torch.nn")
    torch_nn_functional_module = ModuleType("torch.nn.functional")
    torch_nn_functional_module.normalize = lambda tensor, **_: tensor
    torch_nn_module.functional = torch_nn_functional_module
    torch_module.nn = torch_nn_module
    monkeypatch.setitem(sys.modules, "torch", torch_module)
    monkeypatch.setitem(sys.modules, "torch.nn", torch_nn_module)
    monkeypatch.setitem(sys.modules, "torch.nn.functional", torch_nn_functional_module)

    embedder = Specter2AdhocQueryEmbedder(
        base_model_name="allenai/specter2_base",
        adapter_name="allenai/specter2_adhoc_query",
        cache_dir="/tmp/hf-cache",
        max_length=512,
        use_gpu=True,
    )

    vector = embedder.encode("Bidirectional transformers")

    assert vector == [0.25, 0.5, 0.75]
    assert calls["load_adapter"][0] == "allenai/specter2_adhoc_query"
    assert calls["load_adapter"][1]["set_active"] is False
    assert calls["set_active_adapters"] == "QRY"
    assert calls["model_device"] == "cuda"
    assert "input_ids" in calls["model_called"]


def test_specter2_query_embedder_suppresses_known_load_warning(monkeypatch, caplog):
    class FakeTokenizer:
        pass

    class FakeModel:
        active_adapters = None
        adapters_config = SimpleNamespace(active_setup=None)

        def load_adapter(self, *_args, **_kwargs):
            logging.getLogger("adapters.model_mixin").warning(
                "There are adapters available but none are activated for the forward pass."
            )
            return "QRY"

        def set_active_adapters(self, adapter_ref):
            assert adapter_ref == "QRY"
            self.active_adapters = "Stack[[QRY]]"
            self.adapters_config.active_setup = "Stack[[QRY]]"

        def to(self, _device):
            return self

        def eval(self):
            return None

    fake_model = FakeModel()
    monkeypatch.setitem(
        sys.modules,
        "adapters",
        SimpleNamespace(
            AutoAdapterModel=SimpleNamespace(
                from_pretrained=lambda *args, **kwargs: fake_model
            )
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "adapters.model_mixin",
        SimpleNamespace(logger=logging.getLogger("adapters.model_mixin")),
    )
    monkeypatch.setitem(
        sys.modules,
        "transformers",
        SimpleNamespace(
            AutoTokenizer=SimpleNamespace(
                from_pretrained=lambda *args, **kwargs: FakeTokenizer()
            )
        ),
    )
    torch_module = ModuleType("torch")
    torch_module.device = lambda name: name
    torch_module.cuda = SimpleNamespace(is_available=lambda: False)
    monkeypatch.setitem(sys.modules, "torch", torch_module)

    embedder = Specter2AdhocQueryEmbedder(
        base_model_name="allenai/specter2_base",
        adapter_name="allenai/specter2_adhoc_query",
        cache_dir="/tmp/hf-cache",
        max_length=512,
        use_gpu=True,
    )

    with caplog.at_level(logging.WARNING, logger="adapters.model_mixin"):
        assert embedder.initialize() is True

    assert (
        "There are adapters available but none are activated for the forward pass."
        not in caplog.text
    )
