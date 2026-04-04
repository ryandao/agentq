"""Unified token-usage / model extraction from LLM response objects."""

from __future__ import annotations

from typing import Any


def extract_usage(response: Any) -> dict[str, Any] | None:
    """Try to pull normalised token-usage + model from a response object.

    Returns ``{"usage": {...}, "model": ...}`` or *None* when nothing useful
    could be extracted.  The caller should merge the result into span metadata.
    """
    if response is None:
        return None

    usage: dict[str, int] = {}
    model: str | None = None

    # -- OpenAI / AzureOpenAI  (ChatCompletion) ----------------------------
    if _has(response, "usage") and _has(response.usage, "prompt_tokens"):
        u = response.usage
        usage = {
            "prompt_tokens": getattr(u, "prompt_tokens", 0) or 0,
            "completion_tokens": getattr(u, "completion_tokens", 0) or 0,
            "total_tokens": getattr(u, "total_tokens", 0) or 0,
        }
        model = getattr(response, "model", None)

    # -- Anthropic  (Message) -----------------------------------------------
    elif _has(response, "usage") and _has(response.usage, "input_tokens"):
        u = response.usage
        prompt = getattr(u, "input_tokens", 0) or 0
        completion = getattr(u, "output_tokens", 0) or 0
        usage = {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion,
        }
        model = getattr(response, "model", None)

    # -- Google GenAI  (GenerateContentResponse) ----------------------------
    elif _has(response, "usage_metadata"):
        um = response.usage_metadata
        prompt = getattr(um, "prompt_token_count", 0) or 0
        completion = getattr(um, "candidates_token_count", 0) or 0
        total = getattr(um, "total_token_count", 0) or (prompt + completion)
        usage = {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": total,
        }
        model = getattr(response, "model_version", None)

    if not usage:
        return None

    result: dict[str, Any] = {"usage": usage}
    if model:
        result["model"] = model
    return result


def _has(obj: Any, attr: str) -> bool:
    try:
        return getattr(obj, attr, None) is not None
    except Exception:
        return False
