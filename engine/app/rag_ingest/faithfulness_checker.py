"""Faithfulness checking via Patronus Lynx 8B (Ollama).

Structured 3-field prompt → JSON output with REASONING + PASS/FAIL verdict.
Skips gracefully when Ollama is not available.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)

_LYNX_MODEL = "PatronusAI/Lynx-8B-Instruct-Q4_K_M-GGUF"
_LYNX_FALLBACK_MODEL = "lynx"


@dataclass
class ClaimVerdict:
    question: str
    context_excerpt: str
    claim: str
    reasoning: str
    verdict: str  # "PASS" or "FAIL"
    success: bool = True


class ClaimChecker(Protocol):
    def check(
        self,
        question: str,
        context: str,
        answer: str,
    ) -> ClaimVerdict: ...


class LynxFaithfulnessChecker:
    """Faithfulness checker using Patronus Lynx 8B via local Ollama.

    Follows Lynx's structured prompt format:
    - QUESTION: the user query
    - DOCUMENT: evidence context
    - CLAIM: the answer text to verify

    Returns structured JSON with REASONING and RESULT (hallucination/faithful).
    """

    def __init__(self, *, model: str | None = None, base_url: str = "http://127.0.0.1:11434"):
        self._model = model or _LYNX_FALLBACK_MODEL
        self._base_url = base_url
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import ollama

            self._client = ollama.Client(host=self._base_url)
            return self._client
        except ImportError:
            logger.debug("ollama package not installed")
            return None
        except Exception:
            logger.debug("Failed to create Ollama client", exc_info=True)
            return None

    def available(self) -> bool:
        client = self._get_client()
        if client is None:
            return False
        try:
            client.list()
            return True
        except Exception:
            return False

    def check(
        self,
        question: str,
        context: str,
        answer: str,
    ) -> ClaimVerdict:
        client = self._get_client()
        if client is None:
            return ClaimVerdict(
                question=question,
                context_excerpt=context[:200],
                claim=answer[:200],
                reasoning="Ollama client not available",
                verdict="SKIP",
                success=False,
            )

        prompt = (
            "Given the following QUESTION, DOCUMENT and CLAIM, determine whether "
            "the CLAIM is faithful to the content of the DOCUMENT. A claim is faithful "
            "if it can be directly inferred from the document content.\n\n"
            f"QUESTION: {question}\n\n"
            f"DOCUMENT: {context}\n\n"
            f"CLAIM: {answer}\n\n"
            "Respond with a JSON object containing:\n"
            '- "REASONING": your step-by-step analysis\n'
            '- "RESULT": either "hallucination" or "faithful"\n'
        )

        try:
            response = client.chat(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                format="json",
            )
            content = response.get("message", {}).get("content", "{}")
            parsed = json.loads(content)
            reasoning = parsed.get("REASONING", parsed.get("reasoning", ""))
            result = parsed.get("RESULT", parsed.get("result", ""))
            verdict = "PASS" if result.lower() == "faithful" else "FAIL"
            return ClaimVerdict(
                question=question,
                context_excerpt=context[:200],
                claim=answer[:200],
                reasoning=str(reasoning),
                verdict=verdict,
            )
        except Exception as exc:
            logger.debug("Lynx check failed: %s", exc)
            return ClaimVerdict(
                question=question,
                context_excerpt=context[:200],
                claim=answer[:200],
                reasoning=f"Lynx check error: {exc}",
                verdict="SKIP",
                success=False,
            )
