"""
AutoGen Multi-Agent Example
=============================

A software development team using AutoGen-style multi-agent conversation
patterns, traced by AgentQ. An Architect, Developer, and Reviewer exchange
messages in a structured workflow — each agent responds to the previous
agent's output, simulating AutoGen's conversational collaboration.

AgentQ captures the full conversation trace: the session is the root span,
with each agent turn as a child span containing tool calls and LLM
interactions.

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
# Initialize AgentQ with AutoGen auto-instrumentation
# ---------------------------------------------------------------------------

ENDPOINT = os.environ.get("AGENTQ_ENDPOINT", "http://localhost:3000")

agentq.init(endpoint=ENDPOINT, service_name="autogen-multi-agent-example")
agentq.instrument()  # Auto-detects AutoGen if installed and wraps agent methods

print(f"\u2705 AgentQ initialized \u2014 sending traces to {ENDPOINT}")

# Try to detect AutoGen for informational purposes
try:
    import autogen  # noqa: F401
    print("   AutoGen detected \u2014 auto-instrumentation active")
except ImportError:
    try:
        import autogen_agentchat  # noqa: F401
        print("   AutoGen AgentChat detected \u2014 auto-instrumentation active")
    except ImportError:
        print("   AutoGen not installed \u2014 using AgentQ native tracing to demonstrate conversation patterns")
        print("   (Install pyautogen to see framework auto-instrumentation in action)")


# ---------------------------------------------------------------------------
# Mock LLM helper (simulates LLM calls without requiring API keys)
# ---------------------------------------------------------------------------

def _mock_llm_call(prompt: str, agent_role: str = "assistant", model: str = "gpt-4") -> str:
    """Simulate an LLM call with realistic delay and role-aware canned responses.

    Uses the agent_role to determine what kind of response to generate,
    so the conversation stays coherent.
    """
    time.sleep(random.uniform(0.1, 0.3))  # simulate network latency
    prompt_lower = prompt.lower()

    if agent_role == "architect":
        if "design" in prompt_lower or "architect" in prompt_lower or "build" in prompt_lower:
            return (
                "## System Architecture: Agent Trace Collector\n\n"
                "### Components\n"
                "1. **TraceReceiver** \u2014 HTTP endpoint accepting OTLP-formatted spans\n"
                "2. **SpanProcessor** \u2014 validates, enriches, and batches incoming spans\n"
                "3. **TraceStore** \u2014 PostgreSQL-backed storage with parent-child indexing\n"
                "4. **QueryEngine** \u2014 API layer for trace retrieval and filtering\n\n"
                "### Data Flow\n"
                "```\n"
                "SDK \u2192 TraceReceiver \u2192 SpanProcessor \u2192 TraceStore \u2192 QueryEngine \u2192 Dashboard\n"
                "```\n\n"
                "### Key Design Decisions\n"
                "- Use OpenTelemetry protobuf format for wire protocol\n"
                "- Batch inserts for throughput (100ms flush interval)\n"
                "- Materialized parent-child paths for fast hierarchy queries\n"
                "- Connection pooling with max 20 concurrent DB connections"
            )
        elif "review" in prompt_lower or "feedback" in prompt_lower:
            return (
                "Architecture review feedback incorporated:\n"
                "- Added circuit breaker pattern for TraceReceiver \u2192 TraceStore path\n"
                "- Increased connection pool to 30 for high-throughput scenarios\n"
                "- Added retry queue for failed batch inserts\n"
                "- Approved: design is ready for implementation"
            )
        else:
            return f"[Architect response for: {prompt[:60]}...]"

    elif agent_role == "developer":
        # Check "fix/address" before "implement/code" since fix prompts contain "code"
        if "fix" in prompt_lower or "address" in prompt_lower:
            return (
                "## Fixes Applied\n\n"
                "1. Added input validation for malformed spans (returns 400)\n"
                "2. Wrapped flush() in try/except with retry logic\n"
                "3. Added rate limiting (1000 req/s per client)\n"
                "4. All 15 tests passing, including new edge case tests"
            )
        elif "implement" in prompt_lower or "code" in prompt_lower or "build" in prompt_lower:
            return (
                "## Implementation: TraceReceiver + SpanProcessor\n\n"
                "```python\n"
                "class TraceReceiver:\n"
                "    def __init__(self, processor: SpanProcessor):\n"
                "        self.processor = processor\n"
                "        self.app = FastAPI()\n"
                "        self.app.post('/v1/traces')(self.receive_traces)\n\n"
                "    async def receive_traces(self, request: Request):\n"
                "        spans = parse_otlp_request(request)\n"
                "        await self.processor.process_batch(spans)\n"
                "        return {'accepted': len(spans)}\n\n"
                "class SpanProcessor:\n"
                "    def __init__(self, store: TraceStore, batch_size=100):\n"
                "        self.store = store\n"
                "        self.buffer = []\n"
                "        self.batch_size = batch_size\n\n"
                "    async def process_batch(self, spans):\n"
                "        validated = [self.validate(s) for s in spans]\n"
                "        self.buffer.extend(validated)\n"
                "        if len(self.buffer) >= self.batch_size:\n"
                "            await self.flush()\n"
                "```\n\n"
                "Tests: 12 unit tests, 3 integration tests \u2014 all passing."
            )
        else:
            return f"[Developer response for: {prompt[:60]}...]"

    elif agent_role == "reviewer":
        # Check "approve/final" before "review" since final-review prompts contain "review"
        if "approve" in prompt_lower or "lgtm" in prompt_lower or "final" in prompt_lower:
            return (
                "## Final Review\n\n"
                "\u2705 All issues addressed. Code is clean, well-tested, and ready to merge.\n\n"
                "**Verdict:** Approved \u2014 ship it!"
            )
        elif "review" in prompt_lower or "check" in prompt_lower or "look" in prompt_lower:
            return (
                "## Code Review: TraceReceiver + SpanProcessor\n\n"
                "\u2705 **Strengths:**\n"
                "- Clean separation of concerns (receiver vs. processor)\n"
                "- Async throughout \u2014 good for I/O-bound trace ingestion\n"
                "- Batch processing reduces DB round-trips\n\n"
                "\u26a0\ufe0f **Issues to address:**\n"
                "1. No input validation on incoming spans \u2014 malformed data could crash the processor\n"
                "2. `flush()` has no error handling \u2014 a DB failure loses the entire batch\n"
                "3. Missing rate limiting \u2014 a runaway SDK could overwhelm the receiver\n\n"
                "\U0001f4ac **Suggestion:** Add a dead-letter queue for spans that fail validation.\n\n"
                "**Verdict:** Request changes \u2014 fix issues 1-3 before merge."
            )
        else:
            return f"[Reviewer response for: {prompt[:60]}...]"

    else:
        return f"[Mock response for {agent_role}: {prompt[:60]}...]"


# ---------------------------------------------------------------------------
# Agent 1 \u2014 Architect (designs the system)
# ---------------------------------------------------------------------------

@agentq.agent(
    name="architect",
    description="Designs system architecture based on requirements",
)
def architect_agent(task_description: str, context: dict | None = None) -> dict:
    """Architect agent: produces system design from requirements.

    In a real AutoGen setup this would be:
        autogen.AssistantAgent(name='Architect', system_message='...')
    """
    print(f"  \U0001f3d7\ufe0f  Architect: {'Reviewing feedback...' if context else 'Designing system...'}")

    if context and context.get("review_feedback"):
        # Responding to reviewer feedback
        with agentq.track_llm("architect-revise", model="gpt-4") as tracker:
            prompt = f"Review this feedback and update the architecture: {context['review_feedback'][:200]}"
            tracker.set_input({"prompt": prompt, "has_feedback": True})
            response = _mock_llm_call(prompt, agent_role="architect")
            tracker.set_output({"response": response})
            print(f"    \U0001f916 Revised architecture based on feedback")
        return {"role": "architect", "message": response, "phase": "revision"}

    # Initial design phase
    # Tool: Requirements analysis
    with agentq.track_tool("analyze_requirements") as tracker:
        tracker.set_input({"task": task_description})
        time.sleep(random.uniform(0.1, 0.15))
        requirements = {
            "functional": [
                "Accept OTLP-formatted trace data via HTTP",
                "Store spans with parent-child relationships",
                "Query traces by ID, time range, and service name",
            ],
            "non_functional": [
                "Handle 10K spans/second sustained throughput",
                "99th percentile query latency < 200ms",
                "Zero data loss for accepted spans",
            ],
        }
        tracker.set_output(requirements)
        print(f"    \U0001f4cb Analyzed {len(requirements['functional'])} functional + {len(requirements['non_functional'])} non-functional requirements")

    # Tool: Draw architecture diagram
    with agentq.track_tool("create_architecture_diagram") as tracker:
        tracker.set_input({"components": ["TraceReceiver", "SpanProcessor", "TraceStore", "QueryEngine"]})
        time.sleep(random.uniform(0.05, 0.1))
        diagram = "SDK \u2192 TraceReceiver \u2192 SpanProcessor \u2192 TraceStore \u2192 QueryEngine \u2192 Dashboard"
        tracker.set_output({"diagram": diagram, "component_count": 4})
        print(f"    \U0001f5bc\ufe0f  Created architecture diagram (4 components)")

    # LLM: Generate detailed design
    with agentq.track_llm("architect-design", model="gpt-4") as tracker:
        prompt = f"Design a system architecture for: {task_description}"
        tracker.set_input({"prompt": prompt, "requirements": requirements})
        design = _mock_llm_call(prompt, agent_role="architect")
        tracker.set_output({"design": design, "word_count": len(design.split())})
        print(f"    \U0001f916 Generated design ({len(design.split())} words)")

    return {"role": "architect", "message": design, "requirements": requirements, "phase": "initial"}


# ---------------------------------------------------------------------------
# Agent 2 \u2014 Developer (implements the code)
# ---------------------------------------------------------------------------

@agentq.agent(
    name="developer",
    description="Implements code based on architecture and review feedback",
)
def developer_agent(context: dict) -> dict:
    """Developer agent: writes code from architecture, addresses review feedback.

    In a real AutoGen setup this would be:
        autogen.AssistantAgent(name='Developer', system_message='...')
    """
    phase = context.get("phase", "implement")
    if phase == "fix":
        print(f"  \U0001f6e0\ufe0f  Developer: Addressing review feedback...")
    else:
        print(f"  \U0001f4bb Developer: Implementing from architecture...")

    if phase == "fix" and context.get("review_feedback"):
        # Fix issues raised in review
        with agentq.track_llm("developer-fix", model="gpt-4") as tracker:
            prompt = f"Address these review comments and fix the code: {context['review_feedback'][:200]}"
            tracker.set_input({"prompt": prompt, "issues_count": context.get("issues_count", 0)})
            fixes = _mock_llm_call(prompt, agent_role="developer")
            tracker.set_output({"fixes": fixes})
            print(f"    \U0001f916 Applied fixes")

        # Re-run tests after fixes
        with agentq.track_tool("run_tests") as tracker:
            tracker.set_input({"test_suite": "full", "after_fixes": True})
            time.sleep(random.uniform(0.1, 0.15))
            test_results = {"total": 15, "passed": 15, "failed": 0, "coverage": "91%"}
            tracker.set_output(test_results)
            print(f"    \u2705 Tests: {test_results['passed']}/{test_results['total']} passing ({test_results['coverage']} coverage)")

        return {"role": "developer", "message": fixes, "test_results": test_results, "phase": "fix"}

    # Initial implementation phase
    # LLM: Write implementation
    with agentq.track_llm("developer-implement", model="gpt-4") as tracker:
        architecture = context.get("message", "")
        prompt = f"Implement the code based on this architecture: {architecture[:200]}"
        tracker.set_input({"prompt": prompt})
        implementation = _mock_llm_call(prompt, agent_role="developer")
        tracker.set_output({"implementation": implementation, "word_count": len(implementation.split())})
        print(f"    \U0001f916 Wrote implementation ({len(implementation.split())} words)")

    # Tool: Run tests
    with agentq.track_tool("run_tests") as tracker:
        tracker.set_input({"test_suite": "full"})
        time.sleep(random.uniform(0.1, 0.2))
        test_results = {"total": 12, "passed": 12, "failed": 0, "coverage": "87%"}
        tracker.set_output(test_results)
        print(f"    \u2705 Tests: {test_results['passed']}/{test_results['total']} passing ({test_results['coverage']} coverage)")

    # Tool: Static analysis
    with agentq.track_tool("static_analysis") as tracker:
        tracker.set_input({"files": ["trace_receiver.py", "span_processor.py"]})
        time.sleep(random.uniform(0.05, 0.1))
        analysis = {"warnings": 2, "errors": 0, "style_issues": 1}
        tracker.set_output(analysis)
        print(f"    \U0001f50d Static analysis: {analysis['warnings']} warnings, {analysis['errors']} errors")

    return {
        "role": "developer",
        "message": implementation,
        "test_results": test_results,
        "phase": "implement",
    }


# ---------------------------------------------------------------------------
# Agent 3 \u2014 Reviewer (reviews code quality)
# ---------------------------------------------------------------------------

@agentq.agent(
    name="reviewer",
    description="Reviews code for correctness, style, and best practices",
)
def reviewer_agent(context: dict) -> dict:
    """Reviewer agent: reviews code and provides feedback.

    In a real AutoGen setup this would be:
        autogen.AssistantAgent(name='Reviewer', system_message='...')
    """
    phase = context.get("phase", "review")
    if phase == "final":
        print(f"  \U0001f50e Reviewer: Final review of fixes...")
    else:
        print(f"  \U0001f50e Reviewer: Reviewing implementation...")

    if phase == "final":
        # Final review after fixes
        with agentq.track_llm("reviewer-final", model="gpt-4") as tracker:
            prompt = f"Final review of fixes \u2014 check if all issues are addressed: {context.get('message', '')[:200]}"
            tracker.set_input({"prompt": prompt, "is_final_review": True})
            verdict = _mock_llm_call(prompt, agent_role="reviewer")
            tracker.set_output({"verdict": verdict, "approved": True})
            print(f"    \u2705 Approved \u2014 code is ready to merge")
        return {"role": "reviewer", "message": verdict, "approved": True, "phase": "final"}

    # Initial review
    # Tool: Run code quality checks
    with agentq.track_tool("code_quality_check") as tracker:
        tracker.set_input({"code_length": len(context.get("message", ""))})
        time.sleep(random.uniform(0.1, 0.15))
        quality = {
            "complexity_score": "B+",
            "maintainability": "A-",
            "test_coverage": context.get("test_results", {}).get("coverage", "unknown"),
        }
        tracker.set_output(quality)
        print(f"    \U0001f4ca Quality: complexity={quality['complexity_score']}, maintainability={quality['maintainability']}")

    # LLM: Review the code
    with agentq.track_llm("reviewer-review", model="gpt-4") as tracker:
        implementation = context.get("message", "")
        prompt = f"Review this code implementation for correctness and best practices: {implementation[:200]}"
        tracker.set_input({"prompt": prompt, "quality_metrics": quality})
        review = _mock_llm_call(prompt, agent_role="reviewer")
        tracker.set_output({"review": review, "word_count": len(review.split())})
        print(f"    \U0001f916 Completed review ({len(review.split())} words)")

    return {
        "role": "reviewer",
        "message": review,
        "quality": quality,
        "approved": False,
        "phase": "review",
    }


# ---------------------------------------------------------------------------
# Conversation orchestration (mirrors AutoGen's initiate_chat pattern)
# ---------------------------------------------------------------------------

@agentq.agent(
    name="dev-team-conversation",
    description="Orchestrates a multi-agent software development conversation",
)
def dev_team_conversation(task: str) -> dict:
    """Run a multi-agent conversation for software development.

    This mirrors AutoGen's conversation pattern where agents take turns:
    1. User sends a task to the Architect
    2. Architect produces a design
    3. Developer implements from the design
    4. Reviewer reviews the implementation
    5. Developer addresses feedback
    6. Reviewer gives final approval

    In a real AutoGen setup this would be:
        user_proxy = autogen.UserProxyAgent(name='User', ...)
        architect = autogen.AssistantAgent(name='Architect', ...)
        developer = autogen.AssistantAgent(name='Developer', ...)
        reviewer = autogen.AssistantAgent(name='Reviewer', ...)
        user_proxy.initiate_chat(architect, message=task)

    Trace hierarchy:
        dev-team-conversation (session)
        \u251c\u2500\u2500 architect (turn 1 \u2014 initial design)
        \u2502   \u251c\u2500\u2500 [tool] analyze_requirements
        \u2502   \u251c\u2500\u2500 [tool] create_architecture_diagram
        \u2502   \u2514\u2500\u2500 [llm]  architect-design
        \u251c\u2500\u2500 developer (turn 2 \u2014 implementation)
        \u2502   \u251c\u2500\u2500 [llm]  developer-implement
        \u2502   \u251c\u2500\u2500 [tool] run_tests
        \u2502   \u2514\u2500\u2500 [tool] static_analysis
        \u251c\u2500\u2500 reviewer (turn 3 \u2014 code review)
        \u2502   \u251c\u2500\u2500 [tool] code_quality_check
        \u2502   \u2514\u2500\u2500 [llm]  reviewer-review
        \u251c\u2500\u2500 developer (turn 4 \u2014 address feedback)
        \u2502   \u251c\u2500\u2500 [llm]  developer-fix
        \u2502   \u2514\u2500\u2500 [tool] run_tests
        \u2514\u2500\u2500 reviewer (turn 5 \u2014 final approval)
            \u2514\u2500\u2500 [llm]  reviewer-final
    """
    print(f"\n\U0001f4ac Dev Team: Starting conversation about '{task}'")
    print("=" * 60)

    conversation_history: list[dict] = []

    # Turn 1: Architect designs the system
    print(f"\n\U0001f4e8 Turn 1 \u2014 User \u2192 Architect: '{task}'")
    arch_result = architect_agent(task)
    conversation_history.append(arch_result)
    print(f"  \u2705 Architect delivered design")

    # Turn 2: Developer implements from design
    print(f"\n\U0001f4e8 Turn 2 \u2014 Architect \u2192 Developer: 'Implement this design'")
    dev_result = developer_agent(arch_result)
    conversation_history.append(dev_result)
    print(f"  \u2705 Developer delivered implementation")

    # Turn 3: Reviewer reviews the code
    print(f"\n\U0001f4e8 Turn 3 \u2014 Developer \u2192 Reviewer: 'Please review my code'")
    review_result = reviewer_agent(dev_result)
    conversation_history.append(review_result)
    print(f"  \u2705 Reviewer delivered feedback (approved={review_result['approved']})")

    # Turn 4: Developer addresses review feedback
    print(f"\n\U0001f4e8 Turn 4 \u2014 Reviewer \u2192 Developer: 'Fix these issues'")
    fix_context = {
        "phase": "fix",
        "review_feedback": review_result["message"],
        "issues_count": 3,
    }
    fix_result = developer_agent(fix_context)
    conversation_history.append(fix_result)
    print(f"  \u2705 Developer addressed all feedback")

    # Turn 5: Reviewer gives final approval
    print(f"\n\U0001f4e8 Turn 5 \u2014 Developer \u2192 Reviewer: 'Ready for final review'")
    final_context = {"phase": "final", "message": fix_result["message"]}
    final_result = reviewer_agent(final_context)
    conversation_history.append(final_result)
    print(f"  \u2705 Reviewer: {'APPROVED' if final_result['approved'] else 'CHANGES REQUESTED'}")

    print("\n" + "=" * 60)
    print(f"\U0001f389 Conversation complete \u2014 {len(conversation_history)} turns, code approved!")

    return {
        "task": task,
        "turns": len(conversation_history),
        "approved": final_result["approved"],
        "history": conversation_history,
    }


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    """Run the development team conversation inside an AgentQ session."""
    print("\n" + "=" * 60)
    print("  AgentQ AutoGen Multi-Agent Example")
    print("  Dev Team: Architect \u2194 Developer \u2194 Reviewer")
    print("=" * 60)

    task = "Build an agent trace collector that receives OTLP spans and stores them with parent-child relationships"

    # Run inside a session so all spans are grouped together
    with agentq.session(session_id="autogen-example-001", name="autogen-dev-team"):
        result = dev_team_conversation(task)

    print(f"\n\U0001f4cb Conversation Summary:")
    print("-" * 40)
    print(f"  Task: {result['task']}")
    print(f"  Turns: {result['turns']}")
    print(f"  Final verdict: {'Approved \u2705' if result['approved'] else 'Changes requested \u274c'}")
    for entry in result["history"]:
        role = entry["role"]
        phase = entry.get("phase", "")
        print(f"  \u2022 {role} ({phase}): {entry['message'][:80]}...")
    print("-" * 40)
    print(f"\n\U0001f517 View traces at: {ENDPOINT}")
    print("   Look for the 'dev-team-conversation' span with nested architect, developer, and reviewer turns.\n")


if __name__ == "__main__":
    main()
