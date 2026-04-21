"""
Mock LLM Helper
================

Provides a keyword-matching mock LLM that returns realistic responses
without requiring any API keys. Used by all chat app examples.

Usage:
    llm = MockLLM()
    llm.add_response("billing", "I can help with billing questions...")
    response = llm.generate("I have a billing question")
"""

from __future__ import annotations

import time
import random
from dataclasses import dataclass, field


@dataclass
class ResponseRule:
    """A keyword → response mapping for the mock LLM."""
    keywords: list[str]
    response: str
    priority: int = 0  # higher priority rules are checked first


class MockLLM:
    """A keyword-matching mock LLM that returns canned responses.

    Responses are matched by scanning the prompt for keywords.
    If no keywords match, a default fallback response is returned.

    Args:
        default_response: Fallback when no keywords match.
        delay_range: Tuple of (min, max) seconds to simulate latency.
    """

    def __init__(
        self,
        default_response: str = "I understand your question. Let me help you with that.",
        delay_range: tuple[float, float] = (0.1, 0.3),
    ):
        self._rules: list[ResponseRule] = []
        self._default_response = default_response
        self._delay_range = delay_range

    def add_response(
        self,
        keywords: str | list[str],
        response: str,
        priority: int = 0,
    ) -> MockLLM:
        """Register a keyword → response rule. Returns self for chaining."""
        kw_list = [keywords] if isinstance(keywords, str) else keywords
        self._rules.append(ResponseRule(
            keywords=[k.lower() for k in kw_list],
            response=response,
            priority=priority,
        ))
        # Keep sorted by priority (highest first)
        self._rules.sort(key=lambda r: r.priority, reverse=True)
        return self

    def generate(self, prompt: str, delay: bool = True) -> str:
        """Generate a response for the given prompt.

        Args:
            prompt: The input text to respond to.
            delay: Whether to simulate network latency.

        Returns:
            The matched or default response string.
        """
        if delay:
            time.sleep(random.uniform(*self._delay_range))

        prompt_lower = prompt.lower()

        for rule in self._rules:
            if any(kw in prompt_lower for kw in rule.keywords):
                return rule.response

        return self._default_response
