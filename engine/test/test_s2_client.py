"""Tests for app.corpus.s2_client — Semantic Scholar API client."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.corpus.s2_client import (
    DEFAULT_FIELDS,
    MAX_BATCH_SIZE,
    MAX_RESPONSE_BYTES,
    MAX_RETRIES,
    S2Client,
)


# ── Constants ──────────────────────────────────────────────────


class TestConstants:
    def test_max_batch_size(self):
        assert MAX_BATCH_SIZE == 500

    def test_max_response_bytes(self):
        assert MAX_RESPONSE_BYTES == 10_000_000

    def test_max_retries(self):
        assert MAX_RETRIES == 5

    def test_default_fields(self):
        assert "abstract" in DEFAULT_FIELDS
        assert "tldr" in DEFAULT_FIELDS
        assert "embedding" in DEFAULT_FIELDS


# ── S2Client initialization ───────────────────────────────────


class TestS2ClientInit:
    @patch("app.corpus.s2_client.settings")
    def test_default_rate_limit(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        client = S2Client()
        assert client._rate_limit == 1.0
        client.close()

    @patch("app.corpus.s2_client.settings")
    def test_custom_rate_limit(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        client = S2Client(rate_limit=2.0)
        assert client._rate_limit == 2.0
        client.close()

    @patch("app.corpus.s2_client.settings")
    def test_initial_counters(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        client = S2Client()
        assert client._total_requests == 0
        assert client._total_429s == 0
        assert client._consecutive_429s == 0
        client.close()

    @patch("app.corpus.s2_client.settings")
    def test_context_manager(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        with S2Client() as client:
            assert isinstance(client, S2Client)

    @patch("app.corpus.s2_client.settings")
    def test_stats_property(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        with S2Client() as client:
            stats = client.stats
            assert "total_requests" in stats
            assert "total_429s" in stats
            assert "rate_limit" in stats


# ── fetch_batch ────────────────────────────────────────────────


class TestFetchBatch:
    @patch("app.corpus.s2_client.settings")
    def test_rejects_oversized_batch(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        with S2Client(rate_limit=0) as client:
            with pytest.raises(ValueError, match="exceeds max"):
                client.fetch_batch(list(range(501)))

    @patch("app.corpus.s2_client.settings")
    def test_accepts_max_batch_size(self, mock_settings):
        """Exactly 500 IDs should not raise."""
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'[{"paperId": "abc"}]'
        mock_response.json.return_value = [{"paperId": "abc"}]

        with S2Client(rate_limit=0) as client:
            client._client.post = MagicMock(return_value=mock_response)
            # Should not raise
            client.fetch_batch(list(range(500)))

    @patch("app.corpus.s2_client.settings")
    def test_formats_corpus_ids(self, mock_settings):
        """IDs should be formatted as CorpusId:N."""
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'[]'
        mock_response.json.return_value = []

        with S2Client(rate_limit=0) as client:
            client._client.post = MagicMock(return_value=mock_response)
            client.fetch_batch([123, 456])

            call_kwargs = client._client.post.call_args
            body = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            assert body["ids"] == ["CorpusId:123", "CorpusId:456"]

    @patch("app.corpus.s2_client.settings")
    def test_rejects_oversized_response(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"x" * (MAX_RESPONSE_BYTES + 1)
        mock_response.raise_for_status = MagicMock()

        with S2Client(rate_limit=0) as client:
            client._client.post = MagicMock(return_value=mock_response)
            with pytest.raises(RuntimeError, match="Response size"):
                client.fetch_batch([1])

    @patch("app.corpus.s2_client.settings")
    @patch("time.sleep")  # Don't actually sleep in tests
    def test_raises_after_max_retries_on_429(self, mock_sleep, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        mock_response = MagicMock()
        mock_response.status_code = 429

        with S2Client(rate_limit=0) as client:
            client._client.post = MagicMock(return_value=mock_response)
            with pytest.raises(RuntimeError, match="Max retries"):
                client.fetch_batch([1])

    @patch("app.corpus.s2_client.settings")
    @patch("time.sleep")
    def test_raises_after_max_retries_on_500(self, mock_sleep, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        mock_response = MagicMock()
        mock_response.status_code = 500

        with S2Client(rate_limit=0) as client:
            client._client.post = MagicMock(return_value=mock_response)
            with pytest.raises(RuntimeError, match="Max retries"):
                client.fetch_batch([1])

    @patch("app.corpus.s2_client.settings")
    @patch("time.sleep")
    def test_succeeds_after_transient_429(self, mock_sleep, mock_settings):
        """A 429 followed by a 200 should succeed without raising."""
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        mock_429 = MagicMock()
        mock_429.status_code = 429

        mock_200 = MagicMock()
        mock_200.status_code = 200
        mock_200.content = b'[{"paperId": "abc"}]'
        mock_200.json.return_value = [{"paperId": "abc"}]

        with S2Client(rate_limit=0) as client:
            client._client.post = MagicMock(side_effect=[mock_429, mock_200])
            result = client.fetch_batch([1])

            assert result == [{"paperId": "abc"}]
            assert client._client.post.call_count == 2


# ── fetch_all ──────────────────────────────────────────────────


class TestFetchAll:
    @patch("app.corpus.s2_client.settings")
    def test_yields_non_null_results(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        with S2Client(rate_limit=0) as client:
            # Mock fetch_batch to return [result, None, result]
            client.fetch_batch = MagicMock(
                return_value=[{"paperId": "a"}, None, {"paperId": "b"}]
            )

            results = list(client.fetch_all([1, 2, 3], batch_size=500))

            assert len(results) == 2
            assert results[0] == (1, {"paperId": "a"})
            assert results[1] == (3, {"paperId": "b"})

    @patch("app.corpus.s2_client.settings")
    def test_batches_correctly(self, mock_settings):
        mock_settings.s2_api_key = "test-key"
        mock_settings.s2_api_base = "https://api.test.com"

        with S2Client(rate_limit=0) as client:
            # batch_size=2 with 5 IDs → 3 batches
            call_count = 0

            def mock_fetch(ids, fields=DEFAULT_FIELDS):
                nonlocal call_count
                call_count += 1
                return [{"paperId": str(i)} for i in ids]

            client.fetch_batch = mock_fetch

            results = list(client.fetch_all([1, 2, 3, 4, 5], batch_size=2))

            assert call_count == 3  # ceil(5/2) = 3 batches
            assert len(results) == 5
