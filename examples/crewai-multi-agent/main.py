"""
CrewAI Multi-Agent Example
===========================

A marketing campaign crew using CrewAI-style collaboration patterns,
traced by AgentQ. A Market Analyst, Content Strategist, and Copywriter
work together sequentially — each agent's output feeds the next.

AgentQ captures the full trace hierarchy: the crew "kickoff" is the
root span, with each agent as a child span containing its own tool
calls and LLM interactions.

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
# Initialize AgentQ with CrewAI auto-instrumentation
# ---------------------------------------------------------------------------

ENDPOINT = os.environ.get("AGENTQ_ENDPOINT", "http://localhost:3000")

agentq.init(endpoint=ENDPOINT, service_name="crewai-multi-agent-example")
agentq.instrument()  # Auto-detects CrewAI if installed and wraps Crew/Agent methods

print(f"\u2705 AgentQ initialized — sending traces to {ENDPOINT}")

# Try to detect CrewAI for informational purposes
try:
    import crewai  # noqa: F401
    print("   CrewAI detected — auto-instrumentation active")
except ImportError:
    print("   CrewAI not installed — using AgentQ native tracing to demonstrate crew patterns")
    print("   (Install crewai to see framework auto-instrumentation in action)")


# ---------------------------------------------------------------------------
# Mock LLM helper (simulates LLM calls without requiring API keys)
# ---------------------------------------------------------------------------

def _mock_llm_call(prompt: str, model: str = "gpt-4") -> str:
    """Simulate an LLM call with realistic delay and canned responses.

    Checks the start of the prompt to avoid false matches when later
    prompts embed outputs from earlier steps.
    """
    time.sleep(random.uniform(0.1, 0.3))  # simulate network latency
    prompt_lower = prompt.lower()

    if prompt_lower.startswith("analyze") or prompt_lower.startswith("research the market"):
        return (
            "Market Analysis Report:\n"
            "1. The AI observability market is projected to reach $4.2B by 2026, growing 40% YoY\n"
            "2. Key competitors: Langfuse (open-source tracing), Arize (ML monitoring), W&B (experiment tracking)\n"
            "3. Untapped opportunity: native multi-agent trace visualization \u2014 none of the current\n"
            "   players offer first-class support for tracing agent-to-agent delegation hierarchies\n"
            "4. Target audience: AI/ML engineering teams at mid-to-large companies running agent swarms\n"
            "5. Pricing trend: shift toward usage-based models (per-trace / per-span)"
        )
    elif prompt_lower.startswith("develop") or prompt_lower.startswith("create a content strategy"):
        return (
            "Content Strategy Brief:\n"
            "- Primary message: 'See inside your AI agent swarms'\n"
            "- Key differentiator: Native multi-agent trace hierarchy support\n"
            "- Content pillars:\n"
            "  1. Technical tutorials \u2014 instrumenting popular frameworks (LangChain, CrewAI, AutoGen)\n"
            "  2. Case studies \u2014 real-world debugging stories from multi-agent deployments\n"
            "  3. Benchmark comparisons \u2014 trace latency, overhead, completeness vs. competitors\n"
            "- Distribution: Dev blogs, Twitter/X, Hacker News, Reddit r/MachineLearning\n"
            "- Tone: Technical but approachable, developer-first, show-don't-tell"
        )
    elif prompt_lower.startswith("write") or prompt_lower.startswith("draft"):
        return (
            "# AgentQ: Observability for Multi-Agent AI Systems\n\n"
            "Your AI agents are talking to each other. Can you see what they're saying?\n\n"
            "AgentQ gives you full visibility into multi-agent workflows \u2014 from the "
            "orchestrator's high-level decisions down to each specialist agent's tool "
            "calls and LLM interactions. Built on OpenTelemetry, it captures the "
            "complete trace hierarchy so you can debug failures, optimize latency, "
            "and understand how your agents collaborate.\n\n"
            "## Get started in 3 lines\n\n"
            "```python\n"
            "import agentq\n"
            "agentq.init()\n"
            "agentq.instrument()  # auto-detects your framework\n"
            "```\n\n"
            "Works with LangChain, CrewAI, AutoGen, LlamaIndex, and more \u2014 or use "
            "the native `@agent` decorator for framework-agnostic tracing."
        )
    else:
        return f"[Mock LLM response for: {prompt[:80]}...]"


# ---------------------------------------------------------------------------
# Crew member 1 \u2014 Market Analyst
# ---------------------------------------------------------------------------

@agentq.agent(
    name="market-analyst",
    description="Researches market trends, competition, and opportunities",
)
def market_analyst(topic: str) -> dict:
    """Market Analyst: gathers competitive intelligence and market data.

    In a real CrewAI crew this would be:
        crewai.Agent(role='Market Analyst', goal='...', backstory='...')
    """
    print(f"  \U0001f4ca Market Analyst: Researching market for '{topic}'...")

    # Tool call 1: Market data search
    with agentq.track_tool("market_data_search") as tracker:
        query = f"{topic} market size trends 2025"
        tracker.set_input({"query": query})
        time.sleep(random.uniform(0.1, 0.2))
        market_data = {
            "market_size": "$4.2B",
            "growth_rate": "40% YoY",
            "top_players": ["Langfuse", "Arize", "Weights & Biases", "AgentQ"],
            "segments": ["Agent tracing", "LLM monitoring", "Prompt analytics"],
        }
        tracker.set_output(market_data)
        print(f"    \U0001f4c8 Market data: {market_data['market_size']} market, {market_data['growth_rate']} growth")

    # Tool call 2: Competitor analysis
    with agentq.track_tool("competitor_analysis") as tracker:
        tracker.set_input({"competitors": market_data["top_players"]})
        time.sleep(random.uniform(0.1, 0.15))
        competitor_intel = {
            "gaps": [
                "No native multi-agent trace support",
                "Limited parent-child span visualization",
                "No framework auto-detection",
            ],
            "opportunities": [
                "First-class multi-agent tracing",
                "One-line framework auto-instrumentation",
                "OpenTelemetry-native (portable traces)",
            ],
        }
        tracker.set_output(competitor_intel)
        print(f"    \U0001f50d Found {len(competitor_intel['gaps'])} competitive gaps")

    # LLM call: Synthesize analysis
    with agentq.track_llm("synthesize-analysis", model="gpt-4") as tracker:
        prompt = f"Analyze the market data for {topic} and produce a market analysis report"
        tracker.set_input({"prompt": prompt, "data_points": len(market_data) + len(competitor_intel)})
        analysis = _mock_llm_call(prompt)
        tracker.set_output({"analysis": analysis, "word_count": len(analysis.split())})
        print(f"    \U0001f916 Synthesized analysis ({len(analysis.split())} words)")

    return {
        "topic": topic,
        "market_data": market_data,
        "competitor_intel": competitor_intel,
        "analysis": analysis,
    }


# ---------------------------------------------------------------------------
# Crew member 2 \u2014 Content Strategist
# ---------------------------------------------------------------------------

@agentq.agent(
    name="content-strategist",
    description="Creates content strategy from market research insights",
)
def content_strategist(market_research: dict) -> dict:
    """Content Strategist: turns market insights into a content plan.

    In a real CrewAI crew this would be:
        crewai.Agent(role='Content Strategist', goal='...', backstory='...')
    """
    topic = market_research["topic"]
    print(f"  \U0001f4cb Content Strategist: Building strategy for '{topic}'...")

    # Tool call: Audience segmentation
    with agentq.track_tool("audience_segmentation") as tracker:
        tracker.set_input({"topic": topic, "market_segments": market_research["market_data"]["segments"]})
        time.sleep(random.uniform(0.05, 0.1))
        audiences = {
            "primary": "AI/ML engineering teams (50+ person orgs)",
            "secondary": "DevOps / Platform engineers managing AI infra",
            "tertiary": "AI startup CTOs evaluating observability tools",
        }
        tracker.set_output(audiences)
        print(f"    \U0001f465 Identified {len(audiences)} audience segments")

    # LLM call: Develop strategy
    with agentq.track_llm("develop-strategy", model="gpt-4") as tracker:
        prompt = (
            f"Develop a content strategy for {topic} based on this market analysis: "
            f"{market_research['analysis'][:200]}"
        )
        tracker.set_input({"prompt": prompt, "audience_segments": audiences})
        strategy = _mock_llm_call(prompt)
        tracker.set_output({"strategy": strategy, "word_count": len(strategy.split())})
        print(f"    \U0001f916 Created strategy ({len(strategy.split())} words)")

    # Tool call: Channel prioritization
    with agentq.track_tool("channel_prioritization") as tracker:
        tracker.set_input({"audiences": audiences})
        time.sleep(random.uniform(0.05, 0.1))
        channels = {
            "high_priority": ["Dev blog / technical content", "Twitter/X developer community"],
            "medium_priority": ["Hacker News", "Reddit r/MachineLearning"],
            "low_priority": ["LinkedIn", "YouTube tutorials"],
        }
        tracker.set_output(channels)
        print(f"    \U0001f4e2 Prioritized {sum(len(v) for v in channels.values())} distribution channels")

    return {
        "topic": topic,
        "strategy": strategy,
        "audiences": audiences,
        "channels": channels,
    }


# ---------------------------------------------------------------------------
# Crew member 3 \u2014 Copywriter
# ---------------------------------------------------------------------------

@agentq.agent(
    name="copywriter",
    description="Writes polished marketing copy from strategy brief",
)
def copywriter(strategy_brief: dict) -> str:
    """Copywriter: produces final marketing content.

    In a real CrewAI crew this would be:
        crewai.Agent(role='Copywriter', goal='...', backstory='...')
    """
    topic = strategy_brief["topic"]
    print(f"  \u270d\ufe0f  Copywriter: Writing copy for '{topic}'...")

    # LLM call: Draft copy
    with agentq.track_llm("draft-copy", model="gpt-4") as tracker:
        prompt = (
            f"Write marketing copy for {topic} following this strategy: "
            f"{strategy_brief['strategy'][:200]}"
        )
        tracker.set_input({"prompt": prompt})
        draft = _mock_llm_call(prompt)
        tracker.set_output({"draft": draft, "word_count": len(draft.split())})
        print(f"    \U0001f4dd Drafted copy ({len(draft.split())} words)")

    # Tool call: SEO optimization
    with agentq.track_tool("seo_optimize") as tracker:
        keywords = [topic, "agent observability", "multi-agent tracing", "OpenTelemetry"]
        tracker.set_input({"draft_length": len(draft), "target_keywords": keywords})
        time.sleep(random.uniform(0.05, 0.1))
        seo_score = random.randint(82, 95)
        tracker.set_output({"seo_score": seo_score, "keywords_found": len(keywords)})
        print(f"    \U0001f50e SEO score: {seo_score}/100")

    # Tool call: Format final output
    with agentq.track_tool("format_final") as tracker:
        tracker.set_input({"content_length": len(draft)})
        formatted = f"{draft}\n\n---\n*Generated by the AgentQ CrewAI multi-agent example*\n"
        tracker.set_output({"final_length": len(formatted), "format": "markdown"})
        print(f"    \u2705 Formatted final output")

    return formatted


# ---------------------------------------------------------------------------
# Crew orchestration (mirrors CrewAI's Crew.kickoff() with Process.sequential)
# ---------------------------------------------------------------------------

@agentq.agent(
    name="marketing-crew",
    description="Orchestrates the marketing campaign crew (sequential process)",
)
def marketing_crew(topic: str) -> str:
    """Run the marketing crew with sequential task execution.

    This mirrors CrewAI's Crew.kickoff() with Process.sequential:
    each agent's output is passed as context to the next agent.

    In a real CrewAI setup this would be:
        crew = Crew(
            agents=[analyst, strategist, copywriter],
            tasks=[research_task, strategy_task, copy_task],
            process=Process.sequential,
        )
        crew.kickoff()

    Trace hierarchy:
        marketing-crew (crew)
        \u251c\u2500\u2500 market-analyst (agent)
        \u2502   \u251c\u2500\u2500 [tool] market_data_search
        \u2502   \u251c\u2500\u2500 [tool] competitor_analysis
        \u2502   \u2514\u2500\u2500 [llm]  synthesize-analysis
        \u251c\u2500\u2500 content-strategist (agent)
        \u2502   \u251c\u2500\u2500 [tool] audience_segmentation
        \u2502   \u251c\u2500\u2500 [llm]  develop-strategy
        \u2502   \u2514\u2500\u2500 [tool] channel_prioritization
        \u2514\u2500\u2500 copywriter (agent)
            \u251c\u2500\u2500 [llm]  draft-copy
            \u251c\u2500\u2500 [tool] seo_optimize
            \u2514\u2500\u2500 [tool] format_final
    """
    print(f"\n\U0001f680 Marketing Crew: Kicking off campaign for '{topic}'")
    print("=" * 60)

    # Task 1: Market Research (assigned to Market Analyst)
    print("\n\U0001f4ca Task 1/3: Market Analysis")
    research = market_analyst(topic)
    print(f"  \u2705 Market analysis complete \u2014 {research['market_data']['market_size']} market identified")

    # Task 2: Content Strategy (assigned to Content Strategist)
    print("\n\U0001f4cb Task 2/3: Content Strategy")
    strategy = content_strategist(research)
    print(f"  \u2705 Strategy complete \u2014 {len(strategy['audiences'])} audience segments targeted")

    # Task 3: Copywriting (assigned to Copywriter)
    print("\n\u270d\ufe0f  Task 3/3: Copywriting")
    final_copy = copywriter(strategy)
    print(f"  \u2705 Copy complete \u2014 {len(final_copy.split())} words")

    print("\n" + "=" * 60)
    print("\U0001f389 Crew execution complete!")
    return final_copy


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    """Run the marketing crew inside an AgentQ session."""
    print("\n" + "=" * 60)
    print("  AgentQ CrewAI Multi-Agent Example")
    print("  Marketing Crew: Analyst \u2192 Strategist \u2192 Copywriter")
    print("=" * 60)

    # Run inside a session so all spans are grouped together
    with agentq.session(session_id="crewai-example-001", name="crewai-marketing-crew"):
        result = marketing_crew("AI agent observability")

    print("\n\U0001f4f0 Final Marketing Copy:")
    print("-" * 40)
    print(result)
    print("-" * 40)
    print(f"\n\U0001f517 View traces at: {ENDPOINT}")
    print("   Look for the 'marketing-crew' span with nested analyst, strategist, and copywriter spans.\n")


if __name__ == "__main__":
    main()
