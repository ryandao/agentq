"""
Code Review Assistant — Hierarchical Delegation Pattern
========================================================

A code review assistant where a Manager agent breaks the review into
subtasks and delegates to specialist reviewers: Security, Style, and Logic.
The Manager then assembles consolidated feedback.

Demonstrates hierarchical trace tree — manager span with parallel child
worker spans.

Run:
    streamlit run main.py
"""

from __future__ import annotations

import sys
import os
import uuid
import time
import random

# ---------------------------------------------------------------------------
# Add the shared utilities to the Python path
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import streamlit as st
import agentq
from shared.mock_llm import MockLLM
from shared.agentq_setup import setup_agentq


# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="Code Review Assistant — AgentQ Demo",
    page_icon="🔍",
    layout="centered",
)


# ---------------------------------------------------------------------------
# AgentQ initialization (once per session)
# ---------------------------------------------------------------------------

if "agentq_initialized" not in st.session_state:
    endpoint = setup_agentq("code-review-assistant-chat-app")
    st.session_state.agentq_initialized = True
    st.session_state.agentq_endpoint = endpoint


# ---------------------------------------------------------------------------
# Mock LLM setup for each reviewer role
# ---------------------------------------------------------------------------

# Manager LLM — plans the review and assembles the final report
manager_llm = MockLLM(
    default_response=(
        "I'll review this code for security, style, and logic issues. "
        "Delegating to specialist reviewers now."
    )
)

# Security Reviewer LLM
security_llm = MockLLM(
    default_response=(
        "**Security Review — No critical issues found.**\n\n"
        "The code appears safe from common vulnerabilities. No hardcoded "
        "secrets, SQL injection vectors, or unsafe deserialization detected.\n\n"
        "**Recommendation:** Consider adding input validation for any "
        "user-facing parameters as a defense-in-depth measure."
    )
)
security_llm.add_response(
    ["password", "secret", "api_key", "apikey", "token", "credential"],
    "🚨 **Security Review — CRITICAL: Hardcoded secrets detected!**\n\n"
    "The code contains what appears to be hardcoded credentials or API keys. "
    "This is a serious security vulnerability.\n\n"
    "**Issues found:**\n"
    "- Hardcoded secret values should never appear in source code\n"
    "- These can be extracted from version control history even if removed later\n\n"
    "**Fix:** Use environment variables or a secrets manager:\n"
    "```python\nimport os\napi_key = os.environ['API_KEY']\n```",
    priority=10,
)
security_llm.add_response(
    ["eval(", "exec(", "os.system", "subprocess", "shell"],
    "⚠️ **Security Review — WARNING: Dangerous function usage!**\n\n"
    "The code uses functions that can execute arbitrary code. This creates "
    "a risk of code injection attacks.\n\n"
    "**Issues found:**\n"
    "- `eval()`/`exec()`/`os.system()` can execute arbitrary input\n"
    "- If user input reaches these functions, it's a remote code execution vulnerability\n\n"
    "**Fix:** Use safer alternatives:\n"
    "- Replace `eval()` with `ast.literal_eval()` for data parsing\n"
    "- Replace `os.system()` with `subprocess.run()` with explicit argument lists\n"
    "- Never pass unsanitized user input to code execution functions",
    priority=10,
)
security_llm.add_response(
    ["sql", "query", "cursor", "select ", "insert ", "delete "],
    "⚠️ **Security Review — WARNING: Potential SQL injection!**\n\n"
    "The code constructs SQL queries that may be vulnerable to SQL injection.\n\n"
    "**Issues found:**\n"
    "- String concatenation or f-strings in SQL queries are dangerous\n"
    "- User input could manipulate the query structure\n\n"
    "**Fix:** Always use parameterized queries:\n"
    "```python\n# Bad\ncursor.execute(f\"SELECT * FROM users WHERE id = {user_id}\")\n"
    "# Good\ncursor.execute(\"SELECT * FROM users WHERE id = ?\", (user_id,))\n```",
    priority=10,
)
security_llm.add_response(
    ["import", "request", "http", "url", "fetch", "get", "post"],
    "**Security Review — Minor concerns noted.**\n\n"
    "The code makes HTTP requests. Ensure the following best practices:\n\n"
    "- ✅ Validate and sanitize URLs before making requests\n"
    "- ✅ Use HTTPS for all external communications\n"
    "- ✅ Set appropriate timeouts to prevent hanging connections\n"
    "- ✅ Validate response data before processing\n\n"
    "**Recommendation:** Add timeout parameters and verify TLS certificates.",
)

# Style Reviewer LLM
style_llm = MockLLM(
    default_response=(
        "**Style Review — Generally good.**\n\n"
        "The code follows reasonable conventions. A few suggestions:\n\n"
        "- Consider adding type hints to function signatures\n"
        "- Add docstrings to public functions and classes\n"
        "- Ensure consistent naming conventions (snake_case for functions/variables)\n\n"
        "**Rating:** 7/10 — solid with room for improvement."
    )
)
style_llm.add_response(
    ["class", "self", "def __init__", "__str__", "__repr__"],
    "**Style Review — OOP patterns detected.**\n\n"
    "Class structure observations:\n\n"
    "- ✅ Good use of object-oriented design\n"
    "- 💡 Consider adding `__repr__` for better debugging output\n"
    "- 💡 If classes have many parameters, consider using `@dataclass`\n"
    "- 💡 Document class responsibilities in the docstring\n\n"
    "**Naming:** Class names should use PascalCase, methods should use snake_case.\n\n"
    "**Rating:** 7/10 — well-structured with minor improvements possible.",
)
style_llm.add_response(
    ["lambda", "map", "filter", "reduce", "comprehension", "list("],
    "**Style Review — Functional style patterns detected.**\n\n"
    "Observations on functional patterns:\n\n"
    "- 💡 List comprehensions are preferred over `map()`/`filter()` in Python\n"
    "- 💡 Complex lambdas should be refactored into named functions\n"
    "- 💡 Avoid deeply nested comprehensions — split into intermediate steps\n\n"
    "**Readability tip:** If a comprehension doesn't fit on one line, consider "
    "a for-loop instead.\n\n"
    "**Rating:** 6/10 — functional style is fine, but prioritize readability.",
)
style_llm.add_response(
    ["def ", "return", "args", "kwargs", "function"],
    "**Style Review — Function structure analysis.**\n\n"
    "Function design observations:\n\n"
    "- 💡 Functions longer than 20 lines should be considered for splitting\n"
    "- 💡 Add type hints: `def func(x: int) -> str:`\n"
    "- 💡 Use descriptive parameter names over single letters\n"
    "- 💡 Document with docstrings following Google or NumPy style\n\n"
    "**PEP 8 compliance:** Ensure 2 blank lines before top-level function "
    "definitions and 1 blank line before methods.\n\n"
    "**Rating:** 7/10 — solid function design with type hint gaps.",
)
style_llm.add_response(
    ["print", "logging", "logger", "log"],
    "**Style Review — Logging practices.**\n\n"
    "Observations on logging:\n\n"
    "- ⚠️ Replace `print()` statements with proper `logging` module usage\n"
    "- 💡 Use structured logging for production code\n"
    "- 💡 Set appropriate log levels (DEBUG, INFO, WARNING, ERROR)\n"
    "- 💡 Include context in log messages (request IDs, user IDs)\n\n"
    "**Example:**\n"
    "```python\nimport logging\nlogger = logging.getLogger(__name__)\n"
    "logger.info('Processing request', extra={'request_id': req_id})\n```\n\n"
    "**Rating:** 6/10 — logging practices need improvement.",
)

# Logic Reviewer LLM
logic_llm = MockLLM(
    default_response=(
        "**Logic Review — Code appears sound.**\n\n"
        "The core logic is well-structured. Observations:\n\n"
        "- Control flow is clear and easy to follow\n"
        "- Edge cases appear to be handled\n"
        "- No obvious off-by-one errors or infinite loop risks\n\n"
        "**Suggestion:** Consider adding unit tests to verify the logic "
        "handles boundary conditions correctly."
    )
)
logic_llm.add_response(
    ["for", "while", "loop", "iterate", "range"],
    "**Logic Review — Loop analysis.**\n\n"
    "Loop structure observations:\n\n"
    "- ⚠️ Verify loop termination conditions — ensure no infinite loop risk\n"
    "- 💡 Check for off-by-one errors in range boundaries\n"
    "- 💡 Consider whether the loop could be replaced with a more Pythonic "
    "construct (comprehension, `itertools`, etc.)\n"
    "- 💡 If iterating over a collection and modifying it, use a copy or "
    "collect changes separately\n\n"
    "**Performance:** For large datasets, consider generators or lazy evaluation.",
)
logic_llm.add_response(
    ["if", "else", "elif", "condition", "switch", "match"],
    "**Logic Review — Conditional logic analysis.**\n\n"
    "Branching structure observations:\n\n"
    "- 💡 Ensure all branches are reachable (no dead code)\n"
    "- 💡 Check for missing edge cases — what happens with empty input? None?\n"
    "- ⚠️ Deeply nested if/else blocks reduce readability — consider early "
    "returns or guard clauses\n"
    "- 💡 If using multiple elif, consider a dictionary dispatch pattern\n\n"
    "**Test coverage:** Each branch should have at least one test case.",
)
logic_llm.add_response(
    ["try", "except", "raise", "error", "exception"],
    "**Logic Review — Error handling analysis.**\n\n"
    "Exception handling observations:\n\n"
    "- ⚠️ Avoid bare `except:` — always catch specific exceptions\n"
    "- 💡 Don't silently swallow exceptions — at minimum, log them\n"
    "- 💡 Use custom exception classes for domain-specific errors\n"
    "- 💡 Consider the `finally` block for cleanup operations\n\n"
    "**Anti-pattern to avoid:**\n"
    "```python\n# Bad — hides bugs\ntry:\n    do_something()\nexcept:\n    pass\n"
    "# Good — explicit and logged\ntry:\n    do_something()\nexcept ValueError as e:\n"
    "    logger.error('Validation failed', exc_info=e)\n    raise\n```",
)
logic_llm.add_response(
    ["async", "await", "thread", "concurrent", "parallel", "lock"],
    "**Logic Review — Concurrency analysis.**\n\n"
    "Concurrency observations:\n\n"
    "- ⚠️ Check for race conditions on shared mutable state\n"
    "- 💡 Ensure proper use of locks/semaphores for thread safety\n"
    "- 💡 Verify async functions are properly awaited\n"
    "- 💡 Consider deadlock scenarios if using multiple locks\n\n"
    "**Key principle:** Prefer message passing over shared state when possible.\n\n"
    "**Recommendation:** Add stress tests to exercise concurrent code paths.",
)
logic_llm.add_response(
    ["return", "none", "null", "optional", "default"],
    "**Logic Review — Return value analysis.**\n\n"
    "Return value observations:\n\n"
    "- 💡 Functions that can return `None` should have `Optional[]` type hint\n"
    "- ⚠️ Check that callers handle `None` returns properly\n"
    "- 💡 Prefer raising exceptions over returning error codes/None\n"
    "- 💡 Multiple return paths should return the same type\n\n"
    "**Anti-pattern:** Avoid functions that sometimes return a value and "
    "sometimes return None silently.",
)

# Summary assembler LLM
summary_llm = MockLLM(
    default_response=(
        "## 📋 Consolidated Code Review\n\n"
        "All three review dimensions have been analyzed. See the individual "
        "reports above for detailed findings. Overall the code is in reasonable "
        "shape with specific improvement areas identified by each reviewer."
    )
)


# ---------------------------------------------------------------------------
# Agent functions — each produces spans in AgentQ
# ---------------------------------------------------------------------------

def plan_review(code: str) -> dict:
    """Manager plans which aspects to review based on the code."""
    with agentq.track_llm("plan-review-tasks", model="mock-manager") as llm:
        llm.set_input({"code_snippet": code[:200]})
        plan = manager_llm.generate(code)
        tasks = ["security", "style", "logic"]
        llm.set_output({"plan": plan, "delegated_tasks": tasks})
        return {"plan": plan, "tasks": tasks}


def security_reviewer_agent(code: str) -> dict:
    """Security Reviewer — checks for vulnerabilities and unsafe patterns."""
    with agentq.track_agent("security-reviewer") as tracker:
        tracker.set_input({"code_snippet": code[:200]})

        # Tool: scan for known vulnerability patterns
        with agentq.track_tool("vulnerability-scan") as tool:
            tool.set_input({"action": "scan_patterns", "patterns": [
                "hardcoded_secrets", "sql_injection", "code_injection", "xss",
            ]})
            time.sleep(random.uniform(0.05, 0.15))
            scan_result = {
                "patterns_checked": 4,
                "potential_issues": 1 if any(
                    kw in code.lower()
                    for kw in ["password", "secret", "eval", "exec", "sql", "query"]
                ) else 0,
            }
            tool.set_output(scan_result)

        # LLM: generate security review
        with agentq.track_llm("generate-security-review", model="mock-security") as llm:
            llm.set_input({"code": code[:300], "scan_result": scan_result})
            review = security_llm.generate(code)
            llm.set_output({"review": review[:200]})

        result = {"reviewer": "🔒 Security", "review": review, "scan": scan_result}
        tracker.set_output(result)
        return result


def style_reviewer_agent(code: str) -> dict:
    """Style Reviewer — checks formatting, naming, and Pythonic conventions."""
    with agentq.track_agent("style-reviewer") as tracker:
        tracker.set_input({"code_snippet": code[:200]})

        # Tool: run style linting
        with agentq.track_tool("style-lint") as tool:
            tool.set_input({"action": "lint_code", "rules": ["pep8", "naming", "docstrings"]})
            time.sleep(random.uniform(0.05, 0.15))
            lint_result = {
                "rules_checked": 3,
                "line_count": len(code.strip().split("\n")),
                "has_docstrings": '"""' in code or "'''" in code,
                "has_type_hints": "->" in code or ": " in code,
            }
            tool.set_output(lint_result)

        # LLM: generate style review
        with agentq.track_llm("generate-style-review", model="mock-style") as llm:
            llm.set_input({"code": code[:300], "lint_result": lint_result})
            review = style_llm.generate(code)
            llm.set_output({"review": review[:200]})

        result = {"reviewer": "🎨 Style", "review": review, "lint": lint_result}
        tracker.set_output(result)
        return result


def logic_reviewer_agent(code: str) -> dict:
    """Logic Reviewer — checks correctness, edge cases, and error handling."""
    with agentq.track_agent("logic-reviewer") as tracker:
        tracker.set_input({"code_snippet": code[:200]})

        # Tool: analyze code complexity
        with agentq.track_tool("complexity-analysis") as tool:
            tool.set_input({"action": "analyze_complexity"})
            time.sleep(random.uniform(0.05, 0.15))
            complexity = {
                "cyclomatic_complexity": random.randint(2, 8),
                "nesting_depth": min(4, code.count("    ") // max(1, len(code.split("\n")))),
                "has_error_handling": "try" in code or "except" in code,
                "has_loops": "for" in code or "while" in code,
            }
            tool.set_output(complexity)

        # LLM: generate logic review
        with agentq.track_llm("generate-logic-review", model="mock-logic") as llm:
            llm.set_input({"code": code[:300], "complexity": complexity})
            review = logic_llm.generate(code)
            llm.set_output({"review": review[:200]})

        result = {"reviewer": "🧠 Logic", "review": review, "complexity": complexity}
        tracker.set_output(result)
        return result


def assemble_report(reviews: list[dict], code: str) -> str:
    """Manager assembles the final consolidated review report."""
    with agentq.track_llm("assemble-report", model="mock-manager") as llm:
        llm.set_input({
            "review_count": len(reviews),
            "reviewers": [r["reviewer"] for r in reviews],
        })

        # Build the consolidated report
        sections = []
        for r in reviews:
            sections.append(f"### {r['reviewer']} Reviewer\n\n{r['review']}")

        report = (
            "## 📋 Consolidated Code Review\n\n"
            f"Your code was reviewed by **{len(reviews)} specialist reviewers**. "
            "Here are the findings:\n\n"
            "---\n\n"
            + "\n\n---\n\n".join(sections)
            + "\n\n---\n\n"
            "### ✅ Summary\n\n"
            "All review dimensions complete. Address the findings above to "
            "improve your code quality, security posture, and maintainability."
        )

        llm.set_output({"report_length": len(report)})
        return report


def review_code(code: str, session_id: str) -> dict:
    """Run a full hierarchical code review.

    The Manager agent:
    1. Plans the review (which subtasks to delegate)
    2. Delegates to Security, Style, and Logic reviewers (parallel children)
    3. Assembles a consolidated report

    All steps are traced under a single session in AgentQ.
    """
    with agentq.session(session_id=session_id, name="code-review-assistant"):
        with agentq.track_agent("review-manager") as tracker:
            tracker.set_input({"code_snippet": code[:200], "code_length": len(code)})

            # Step 1: Manager plans the review
            plan = plan_review(code)

            # Step 2: Delegate to specialist reviewers (hierarchical children)
            security_result = security_reviewer_agent(code)
            style_result = style_reviewer_agent(code)
            logic_result = logic_reviewer_agent(code)

            reviews = [security_result, style_result, logic_result]

            # Step 3: Manager assembles consolidated report
            report = assemble_report(reviews, code)

            result = {
                "report": report,
                "reviews": reviews,
                "plan": plan,
            }
            tracker.set_output({
                "review_count": len(reviews),
                "report_length": len(report),
            })
            return result


# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------

st.title("🔍 Code Review Assistant")
st.caption(
    "Paste your code below — a Manager agent delegates review to "
    "Security, Style, and Logic specialists. Watch the hierarchical "
    "traces in AgentQ!"
)

# Sidebar
with st.sidebar:
    st.header("ℹ️ About")
    st.markdown(
        "This app demonstrates the **Hierarchical Delegation** pattern:\n\n"
        "1. 👔 **Manager Agent** plans the review\n"
        "2. It delegates to **3 specialist reviewers** in parallel:\n"
        "   - 🔒 Security Reviewer\n"
        "   - 🎨 Style Reviewer\n"
        "   - 🧠 Logic Reviewer\n"
        "3. Manager **assembles** a consolidated report\n\n"
        "Each reviewer appears as a child span under the Manager in AgentQ."
    )
    st.divider()
    st.markdown(
        f"**AgentQ Dashboard:** [{st.session_state.agentq_endpoint}]"
        f"({st.session_state.agentq_endpoint})"
    )
    st.divider()
    st.subheader("💡 Try pasting:")
    st.markdown(
        "- Code with `password = 'secret123'` → triggers security alert\n"
        "- Code with `eval(user_input)` → triggers injection warning\n"
        "- Code with SQL queries → triggers SQL injection review\n"
        "- Any Python function → gets style and logic feedback"
    )

# Initialize chat history and session ID
if "messages" not in st.session_state:
    st.session_state.messages = []
if "session_id" not in st.session_state:
    st.session_state.session_id = f"code-review-{uuid.uuid4().hex[:8]}"

# Display chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg["role"] == "assistant" and "reviews" in msg:
            with st.expander("🔍 Show individual reviewer reports"):
                for review in msg["reviews"]:
                    st.markdown(f"**{review['reviewer']} Reviewer**")
                    if "scan" in review:
                        st.info(
                            f"🔒 Patterns checked: {review['scan']['patterns_checked']} | "
                            f"Potential issues: {review['scan']['potential_issues']}"
                        )
                    if "lint" in review:
                        st.info(
                            f"🎨 Lines: {review['lint']['line_count']} | "
                            f"Docstrings: {'✅' if review['lint']['has_docstrings'] else '❌'} | "
                            f"Type hints: {'✅' if review['lint']['has_type_hints'] else '❌'}"
                        )
                    if "complexity" in review:
                        st.info(
                            f"🧠 Complexity: {review['complexity']['cyclomatic_complexity']} | "
                            f"Error handling: {'✅' if review['complexity']['has_error_handling'] else '❌'}"
                        )
                    st.markdown(review["review"])
                    st.divider()

# Chat input
if user_input := st.chat_input("Paste code to review..."):
    # Display user message
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)

    # Run the review pipeline
    with st.chat_message("assistant"):
        with st.spinner("👔 Manager delegating to reviewers..."):
            result = review_code(user_input, st.session_state.session_id)

        st.markdown(result["report"])

        # Show individual reviewer reports in an expander
        with st.expander("🔍 Show individual reviewer reports"):
            for review in result["reviews"]:
                st.markdown(f"**{review['reviewer']} Reviewer**")
                if "scan" in review:
                    st.info(
                        f"🔒 Patterns checked: {review['scan']['patterns_checked']} | "
                        f"Potential issues: {review['scan']['potential_issues']}"
                    )
                if "lint" in review:
                    st.info(
                        f"🎨 Lines: {review['lint']['line_count']} | "
                        f"Docstrings: {'✅' if review['lint']['has_docstrings'] else '❌'} | "
                        f"Type hints: {'✅' if review['lint']['has_type_hints'] else '❌'}"
                    )
                if "complexity" in review:
                    st.info(
                        f"🧠 Complexity: {review['complexity']['cyclomatic_complexity']} | "
                        f"Error handling: {'✅' if review['complexity']['has_error_handling'] else '❌'}"
                    )
                st.markdown(review["review"])
                st.divider()

    # Save to history
    st.session_state.messages.append({
        "role": "assistant",
        "content": result["report"],
        "reviews": result["reviews"],
    })
