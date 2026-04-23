"""
Native Multi-Agent Example
===========================

A content production pipeline with an Orchestrator delegating to
Research and Writer specialist agents. Uses AgentQ's native @agent
decorator, track_tool(), and track_llm() for full observability.

Run:
    python main.py

Then open http://localhost:3000 to view traces.
"""

from __future__ import annotations

import os
import time
import random

import agentq

# ---------------------------------------------------------------------------
# Initialize AgentQ
# ---------------------------------------------------------------------------

ENDPOINT = os.environ.get("AGENTQ_ENDPOINT", "http://localhost:3000")

agentq.init(endpoint=ENDPOINT, service_name="native-multi-agent-example")
# Note: We don't call agentq.instrument() here because we're using mock LLM
# calls. If you swap in real OpenAI/Anthropic calls, uncomment the next line:
# agentq.instrument()

print(f"✅ AgentQ initialized — sending traces to {ENDPOINT}")


# ---------------------------------------------------------------------------
# Mock LLM helper (simulates an LLM call without requiring API keys)
# ---------------------------------------------------------------------------

def _mock_llm_call(prompt: str, model: str = "gpt-4") -> str:
    """Simulate an LLM call with a realistic delay and canned response.

    Uses prompt-start matching to avoid false hits when a prompt includes
    the output of a previous step (e.g. the draft prompt includes the outline).
    """
    time.sleep(random.uniform(0.1, 0.3))  # simulate network latency

    prompt_lower = prompt.lower()

    # Check the beginning of the prompt for intent (most → least specific)
    if prompt_lower.startswith("write") or prompt_lower.startswith("draft"):
        return (
            "# AI Agent Observability in 2025\n\n"
            "As AI systems grow more complex, observability becomes critical. "
            "Multi-agent architectures — where an orchestrator delegates to "
            "specialist agents — create intricate execution traces that are "
            "difficult to debug without proper tooling.\n\n"
            "OpenTelemetry provides the foundation: distributed tracing that "
            "captures parent-child relationships across agent boundaries. "
            "When combined with agent-specific metadata (LLM token usage, "
            "tool inputs/outputs, agent delegation patterns), teams can "
            "pinpoint failures and optimize performance.\n\n"
            "The key insight: treat each agent as a traced service, and "
            "each delegation as a span in a distributed trace."
        )
    elif prompt_lower.startswith("create") and "outline" in prompt_lower[:60]:
        return (
            "# Article Outline\n"
            "1. Introduction — Why AI agent observability matters\n"
            "2. The multi-agent challenge — tracing across agent boundaries\n"
            "3. OpenTelemetry as the foundation\n"
            "4. Real-world patterns — orchestrator + specialist agents\n"
            "5. Conclusion — the future of agent debugging"
        )
    elif "analyze" in prompt_lower[:60]:
        return (
            "Based on the sources, here are the key trends:\n"
            "1. OpenTelemetry adoption for AI agent tracing is accelerating\n"
            "2. Multi-agent architectures need specialized observability\n"
            "3. Real-time trace visualization helps debug agent failures faster"
        )
    else:
        return f"[Mock LLM response for: {prompt[:80]}...]"


# ---------------------------------------------------------------------------
# Research Agent — gathers information using tools and LLM analysis
# ---------------------------------------------------------------------------

@agentq.agent(name="research-agent", description="Researches topics using web search and analysis")
def research_agent(topic: str) -> dict:
    """Research a given topic and return structured findings."""
    print(f"  🔍 Research Agent: Researching '{topic}'...")

    # Tool call 1: Web search
    with agentq.track_tool("web_search") as tracker:
        query = f"{topic} latest trends"
        tracker.set_input({"query": query})
        time.sleep(random.uniform(0.1, 0.2))  # simulate search latency
        search_results = [
            {"title": "AI Observability Trends 2025", "url": "https://example.com/ai-obs", "snippet": "OpenTelemetry adoption for AI agents..."},
            {"title": "Multi-Agent Tracing Patterns", "url": "https://example.com/multi-agent", "snippet": "Distributed tracing for agent orchestration..."},
            {"title": "Debugging Agent Failures", "url": "https://example.com/debug", "snippet": "Real-time trace visualization techniques..."},
        ]
        tracker.set_output({"results_count": len(search_results), "results": search_results})
        print(f"    📄 Found {len(search_results)} search results")

    # LLM call: Analyze sources
    with agentq.track_llm("analyze-sources", model="gpt-4") as tracker:
        prompt = f"Analyze these sources about {topic} and identify key trends"
        tracker.set_input({"prompt": prompt, "sources": search_results})
        analysis = _mock_llm_call(prompt)
        tracker.set_output({"analysis": analysis})
        print(f"    🤖 Analyzed sources")

    # Tool call 2: Extract key findings
    with agentq.track_tool("extract_key_findings") as tracker:
        tracker.set_input({"analysis": analysis})
        time.sleep(random.uniform(0.05, 0.1))
        findings = {
            "key_points": [
                "OpenTelemetry adoption for AI agent tracing is accelerating",
                "Multi-agent architectures need specialized observability",
                "Real-time trace visualization helps debug agent failures faster",
            ],
            "sources_analyzed": len(search_results),
            "confidence": 0.87,
        }
        tracker.set_output(findings)
        print(f"    📋 Extracted {len(findings['key_points'])} key findings")

    return {
        "topic": topic,
        "findings": findings,
        "raw_analysis": analysis,
        "source_count": len(search_results),
    }


# ---------------------------------------------------------------------------
# Writer Agent — produces content from research findings
# ---------------------------------------------------------------------------

@agentq.agent(name="writer-agent", description="Writes articles from research findings")
def writer_agent(research: dict) -> str:
    """Write an article based on research findings."""
    topic = research["topic"]
    findings = research["findings"]
    print(f"  ✍️  Writer Agent: Writing article about '{topic}'...")

    # LLM call 1: Generate outline
    with agentq.track_llm("generate-outline", model="gpt-4") as tracker:
        prompt = f"Create an article outline about {topic} based on these findings: {findings['key_points']}"
        tracker.set_input({"prompt": prompt})
        outline = _mock_llm_call(prompt)
        tracker.set_output({"outline": outline})
        print(f"    📝 Generated outline")

    # LLM call 2: Write draft
    with agentq.track_llm("write-draft", model="gpt-4") as tracker:
        prompt = f"Write a draft article following this outline: {outline}"
        tracker.set_input({"prompt": prompt, "outline": outline, "findings": findings})
        draft = _mock_llm_call(prompt)
        tracker.set_output({"draft": draft, "word_count": len(draft.split())})
        print(f"    📄 Wrote draft ({len(draft.split())} words)")

    # Tool call: Format as markdown
    with agentq.track_tool("format_markdown") as tracker:
        tracker.set_input({"draft_length": len(draft)})
        time.sleep(random.uniform(0.05, 0.1))
        formatted = f"{draft}\n\n---\n*Generated by the AgentQ multi-agent example*\n"
        tracker.set_output({"formatted_length": len(formatted), "format": "markdown"})
        print(f"    ✅ Formatted as markdown")

    return formatted


# ---------------------------------------------------------------------------
# Orchestrator Agent — coordinates the full pipeline
# ---------------------------------------------------------------------------

@agentq.agent(name="orchestrator", description="Coordinates the research-to-article pipeline")
def orchestrator(topic: str) -> str:
    """Orchestrate a full content production pipeline.

    1. Delegates research to the Research Agent
    2. Passes findings to the Writer Agent
    3. Returns the finished article
    """
    print(f"\n🎯 Orchestrator: Starting content pipeline for '{topic}'")
    print("=" * 60)

    # Step 1: Research
    print("\n📚 Step 1: Research phase")
    research = research_agent(topic)
    print(f"  ✅ Research complete — {research['source_count']} sources, "
          f"{len(research['findings']['key_points'])} key findings")

    # Step 2: Writing
    print("\n✍️  Step 2: Writing phase")
    article = writer_agent(research)
    print(f"  ✅ Article complete — {len(article.split())} words")

    print("\n" + "=" * 60)
    print("🎉 Pipeline complete!")

    return article


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    """Run the multi-agent content pipeline inside a session."""
    print("\n" + "=" * 60)
    print("  AgentQ Native Multi-Agent Example")
    print("  Orchestrator → Research Agent + Writer Agent")
    print("=" * 60)

    # Run inside a session so all spans are grouped together
    with agentq.session(session_id="example-session-001", name="content-pipeline"):
        article = orchestrator("AI agent observability")

    print("\n📰 Final Article:")
    print("-" * 40)
    print(article)
    print("-" * 40)
    print(f"\n🔗 View traces at: {ENDPOINT}")
    print("   Look for the 'orchestrator' run with nested research-agent and writer-agent spans.\n")


if __name__ == "__main__":
    main()
