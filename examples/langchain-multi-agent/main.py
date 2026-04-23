"""
LangChain Multi-Agent Example
===============================

A content pipeline built with LangChain Runnables, automatically traced by
AgentQ's LangChain integration. An Editor-in-Chief coordinates a Researcher
and Writer — all chain invocations are captured as spans without any @agent
decorator.

Run:
    python main.py

Then open http://localhost:3000 to view traces.
"""

from __future__ import annotations

import os
import time
import random
from typing import Any

import agentq

# ---------------------------------------------------------------------------
# Initialize AgentQ with LangChain auto-instrumentation
# ---------------------------------------------------------------------------

ENDPOINT = os.environ.get("AGENTQ_ENDPOINT", "http://localhost:3000")

agentq.init(endpoint=ENDPOINT, service_name="langchain-multi-agent-example")
agentq.instrument()  # Auto-detects LangChain and installs the callback handler

print(f"✅ AgentQ initialized with LangChain auto-instrumentation")
print(f"   Sending traces to {ENDPOINT}")

# ---------------------------------------------------------------------------
# LangChain imports
# ---------------------------------------------------------------------------

from langchain_core.runnables import RunnableLambda, RunnableSequence
from langchain_core.callbacks import CallbackManager
from langchain_core.outputs import LLMResult, Generation


# ---------------------------------------------------------------------------
# Fake LLM (simulates LLM responses without needing API keys)
# ---------------------------------------------------------------------------

class FakeLLM:
    """A minimal fake LLM that returns canned responses based on prompt content.

    This mimics langchain's BaseLLM interface enough to demonstrate tracing
    without requiring any API keys.
    """

    def __init__(self, model_name: str = "fake-gpt-4"):
        self.model_name = model_name

    def invoke(self, prompt: str, **kwargs: Any) -> str:
        """Generate a fake response based on the prompt content.

        Order matters: more specific patterns are checked first to avoid
        false matches (e.g. an outline prompt that also mentions 'research').
        """
        time.sleep(random.uniform(0.1, 0.3))  # simulate latency

        prompt_lower = prompt.lower()

        # Check specific patterns first (most → least specific)
        if prompt_lower.startswith("write") or prompt_lower.startswith("draft"):
            return (
                "# Building Observable Multi-Agent Systems\n\n"
                "Multi-agent AI systems are transforming how we build intelligent "
                "applications. An orchestrator agent delegates complex tasks to "
                "specialized agents — a researcher gathers information, a writer "
                "produces content, a reviewer checks quality.\n\n"
                "But this power comes with a debugging challenge: when something "
                "goes wrong, where in the agent chain did it fail? Traditional "
                "logging falls short because it can't capture the parent-child "
                "relationships between agents.\n\n"
                "The solution is distributed tracing adapted for AI agents. Each "
                "agent invocation becomes a span, each delegation creates a "
                "parent-child link, and each LLM call is traced with token usage "
                "and latency metrics. The result: full visibility into your "
                "multi-agent pipeline."
            )
        elif prompt_lower.startswith("create an outline") or "outline for" in prompt_lower:
            return (
                "Article Outline:\n"
                "I. Introduction — The rise of multi-agent AI systems\n"
                "II. The observability gap — why traditional monitoring fails for agents\n"
                "III. Tracing agent delegation — from orchestrator to specialist\n"
                "IV. Practical patterns — what to trace and why\n"
                "V. Conclusion — building reliable multi-agent systems"
            )
        elif "analyze" in prompt_lower or "research" in prompt_lower:
            return (
                "Research findings:\n"
                "1. Multi-agent systems are becoming the dominant AI architecture pattern\n"
                "2. Observability gaps in agent-to-agent communication cause 40% of production failures\n"
                "3. OpenTelemetry-based tracing provides the best foundation for agent debugging\n"
                "4. Teams using agent observability tools resolve issues 3x faster"
            )
        else:
            return f"[Fake LLM response for: {prompt[:60]}...]"


# ---------------------------------------------------------------------------
# Tool functions (traced with agentq.track_tool)
# ---------------------------------------------------------------------------

def web_search(query: str) -> list[dict]:
    """Simulate a web search tool."""
    with agentq.track_tool("web_search") as tracker:
        tracker.set_input({"query": query})
        time.sleep(random.uniform(0.1, 0.2))
        results = [
            {"title": "Multi-Agent Architecture Patterns", "url": "https://example.com/patterns", "snippet": "Best practices for agent orchestration..."},
            {"title": "Agent Observability Guide", "url": "https://example.com/observability", "snippet": "Tracing distributed agent systems..."},
            {"title": "LangChain Multi-Agent Tutorial", "url": "https://example.com/langchain", "snippet": "Building agent teams with LangChain..."},
        ]
        tracker.set_output({"count": len(results), "results": results})
        print(f"    📄 Web search returned {len(results)} results")
        return results


def format_output(text: str) -> str:
    """Format the final output as a polished document."""
    with agentq.track_tool("format_output") as tracker:
        tracker.set_input({"text_length": len(text)})
        time.sleep(random.uniform(0.05, 0.1))
        formatted = f"{text}\n\n---\n*Generated by the AgentQ LangChain multi-agent example*\n"
        tracker.set_output({"formatted_length": len(formatted), "format": "markdown"})
        print(f"    ✅ Formatted output ({len(formatted)} chars)")
        return formatted


# ---------------------------------------------------------------------------
# Agent chains (built as LangChain Runnables)
# ---------------------------------------------------------------------------

fake_llm = FakeLLM()


def _researcher_fn(input_data: dict) -> dict:
    """Researcher agent: searches the web and analyzes findings."""
    topic = input_data.get("topic", "AI agents")
    print(f"\n  🔍 Researcher: Investigating '{topic}'...")

    # Tool call: web search
    search_results = web_search(f"{topic} best practices 2025")

    # LLM call: analyze and summarize (traced manually since we use a fake LLM)
    with agentq.track_llm("analyze-research", model=fake_llm.model_name) as tracker:
        prompt = f"Analyze and research these sources about {topic}: {search_results}"
        tracker.set_input({"prompt": prompt})
        analysis = fake_llm.invoke(prompt)
        tracker.set_output({"analysis": analysis})
        print(f"    🤖 Analyzed research findings")

    return {
        "topic": topic,
        "search_results": search_results,
        "analysis": analysis,
    }


def _writer_fn(input_data: dict) -> dict:
    """Writer agent: creates content from research findings."""
    topic = input_data.get("topic", "AI agents")
    analysis = input_data.get("analysis", "")
    print(f"\n  ✍️  Writer: Creating article about '{topic}'...")

    # LLM call 1: Generate outline
    with agentq.track_llm("generate-outline", model=fake_llm.model_name) as tracker:
        prompt = f"Create an outline for an article about {topic}. Research: {analysis}"
        tracker.set_input({"prompt": prompt})
        outline = fake_llm.invoke(prompt)
        tracker.set_output({"outline": outline})
        print(f"    📝 Generated outline")

    # LLM call 2: Write draft
    with agentq.track_llm("write-draft", model=fake_llm.model_name) as tracker:
        prompt = f"Write a draft article following this outline: {outline}"
        tracker.set_input({"prompt": prompt, "outline": outline})
        draft = fake_llm.invoke(prompt)
        tracker.set_output({"draft": draft, "word_count": len(draft.split())})
        print(f"    📄 Wrote draft ({len(draft.split())} words)")

    # Tool call: format output
    formatted = format_output(draft)

    return {
        "topic": topic,
        "outline": outline,
        "article": formatted,
    }


# Build LangChain Runnables for each agent
researcher_chain = RunnableLambda(_researcher_fn).with_config({"run_name": "researcher-agent"})
writer_chain = RunnableLambda(_writer_fn).with_config({"run_name": "writer-agent"})


def _editor_fn(input_data: dict) -> dict:
    """Editor-in-Chief: orchestrates the research-to-publication pipeline."""
    topic = input_data.get("topic", "AI agents")
    print(f"\n🎯 Editor-in-Chief: Starting publication pipeline for '{topic}'")
    print("=" * 60)

    # Step 1: Delegate to researcher
    print("\n📚 Phase 1: Research")
    research_output = researcher_chain.invoke(input_data)
    print(f"  ✅ Research complete")

    # Step 2: Pass findings to writer
    writer_input = {
        "topic": topic,
        "analysis": research_output["analysis"],
        "search_results": research_output["search_results"],
    }
    print("\n✍️  Phase 2: Writing")
    writer_output = writer_chain.invoke(writer_input)
    print(f"  ✅ Article complete")

    print("\n" + "=" * 60)
    print("🎉 Publication pipeline complete!")

    return {
        "topic": topic,
        "research": research_output,
        "article": writer_output["article"],
    }


# The top-level editor chain
editor_chain = RunnableLambda(_editor_fn).with_config({"run_name": "editor-in-chief"})


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    """Run the LangChain multi-agent pipeline inside a session."""
    print("\n" + "=" * 60)
    print("  AgentQ LangChain Multi-Agent Example")
    print("  Editor-in-Chief → Researcher + Writer")
    print("=" * 60)

    # Run inside a session so all spans are grouped together
    with agentq.session(session_id="langchain-example-001", name="langchain-content-pipeline"):
        # Use track_agent to wrap the top-level chain invocation
        # so it appears as a root agent span in the trace
        with agentq.track_agent("langchain-pipeline") as tracker:
            tracker.set_input({"topic": "multi-agent observability"})
            result = editor_chain.invoke({"topic": "multi-agent observability"})
            tracker.set_output({"article_length": len(result["article"])})

    print("\n📰 Final Article:")
    print("-" * 40)
    print(result["article"])
    print("-" * 40)
    print(f"\n🔗 View traces at: {ENDPOINT}")
    print("   Look for the 'langchain-pipeline' run with nested chain spans.\n")


if __name__ == "__main__":
    main()
