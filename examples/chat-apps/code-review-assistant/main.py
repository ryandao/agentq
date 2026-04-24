"""
Code Review Assistant — Hierarchical Delegation Pattern
========================================================

A code review assistant where a Manager agent delegates to specialist
reviewer agents (Security, Style, Logic) and consolidates their findings.
Demonstrates hierarchical parent-child trace topology: the Manager is
the parent span, each reviewer is a child span with its own tool + LLM
sub-spans.

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
# Mock LLM setup — one per reviewer agent, plus one for the manager
# ---------------------------------------------------------------------------

# Security Reviewer LLM
security_llm = MockLLM(
    default_response=(
        "**Security Review**\n\n"
        "No critical security issues found. Minor recommendations:\n\n"
        "- Consider adding input validation for user-provided data\n"
        "- Ensure error messages don't leak internal implementation details\n"
        "- Review any hardcoded values that could be configuration secrets\n\n"
        "**Risk Level:** Low"
    )
)
security_llm.add_response(
    ["password", "secret", "token", "key", "credential", "auth"],
    "**Security Review — CRITICAL ISSUES FOUND**\n\n"
    "🔴 **Issue 1: Hardcoded Credentials**\n"
    "Detected what appears to be hardcoded credentials or secrets in the code. "
    "These should be moved to environment variables or a secrets manager.\n\n"
    "🟡 **Issue 2: Credential Handling**\n"
    "Sensitive values should never be logged, printed, or included in error messages. "
    "Ensure all credential handling follows the principle of least exposure.\n\n"
    "**Recommendations:**\n"
    "- Use `os.environ.get()` or a secrets manager (e.g., AWS Secrets Manager, Vault)\n"
    "- Add the credential file patterns to `.gitignore`\n"
    "- Rotate any credentials that were previously committed\n\n"
    "**Risk Level:** Critical",
    priority=10,
)
security_llm.add_response(
    ["sql", "query", "select", "insert", "update", "delete", "execute", "cursor"],
    "**Security Review — SQL INJECTION RISK**\n\n"
    "🔴 **Issue 1: Potential SQL Injection**\n"
    "String concatenation or f-strings used to build SQL queries. This is a "
    "classic injection vector.\n\n"
    "**Vulnerable pattern detected:**\n"
    "```python\n"
    "# Dangerous — user input directly in query\n"
    'query = f"SELECT * FROM users WHERE name = \'{user_input}\'"\n'
    "```\n\n"
    "**Fix:** Use parameterized queries:\n"
    "```python\n"
    '# Safe — parameterized query\n'
    'cursor.execute("SELECT * FROM users WHERE name = %s", (user_input,))\n'
    "```\n\n"
    "🟡 **Issue 2: Input Validation**\n"
    "Add input validation and sanitization before any database operations.\n\n"
    "**Risk Level:** Critical",
    priority=10,
)
security_llm.add_response(
    ["eval", "exec", "subprocess", "os.system", "shell", "pickle", "yaml.load"],
    "**Security Review — CODE EXECUTION RISK**\n\n"
    "🔴 **Issue 1: Unsafe Code Execution**\n"
    "Use of `eval()`, `exec()`, or similar functions that execute arbitrary code. "
    "This is extremely dangerous if any input comes from untrusted sources.\n\n"
    "**Recommendations:**\n"
    "- Replace `eval()` with `ast.literal_eval()` for parsing literals\n"
    "- Use `subprocess.run()` with `shell=False` and explicit argument lists\n"
    "- Replace `pickle.loads()` with JSON for untrusted data\n"
    "- Use `yaml.safe_load()` instead of `yaml.load()`\n\n"
    "**Risk Level:** Critical",
    priority=10,
)
security_llm.add_response(
    ["http", "request", "api", "url", "fetch", "endpoint"],
    "**Security Review — NETWORK SECURITY**\n\n"
    "🟡 **Issue 1: HTTPS Enforcement**\n"
    "Ensure all external API calls use HTTPS, not plain HTTP.\n\n"
    "🟡 **Issue 2: Request Validation**\n"
    "Validate and sanitize URLs before making requests to prevent SSRF attacks. "
    "Consider using an allowlist of permitted domains.\n\n"
    "🟢 **Recommendation:** Add request timeouts to prevent hanging connections:\n"
    "```python\n"
    "requests.get(url, timeout=30)\n"
    "```\n\n"
    "**Risk Level:** Medium",
)

# Style Reviewer LLM
style_llm = MockLLM(
    default_response=(
        "**Style Review**\n\n"
        "Code follows reasonable conventions. Suggestions for improvement:\n\n"
        "- Add type hints to function signatures for better readability\n"
        "- Consider adding docstrings to public functions\n"
        "- Some variable names could be more descriptive\n"
        "- Line length is generally acceptable\n\n"
        "**Overall Style Score:** 7/10"
    )
)
style_llm.add_response(
    ["class", "self", "def __init__", "method"],
    "**Style Review — Class Design**\n\n"
    "🟡 **Naming Conventions:**\n"
    "- Class names should use `PascalCase` ✅\n"
    "- Method names should use `snake_case` — verify consistency\n"
    "- Private methods should be prefixed with `_`\n\n"
    "🟡 **Structure:**\n"
    "- Add docstrings to the class and all public methods\n"
    "- Consider using `@dataclass` if the class is primarily a data container\n"
    "- Group related methods together (public first, then private)\n\n"
    "🟢 **Type Hints:**\n"
    "- Add return type annotations to all methods\n"
    "- Use `from __future__ import annotations` for modern type hint syntax\n\n"
    "**Overall Style Score:** 6/10",
)
style_llm.add_response(
    ["import", "from", "module"],
    "**Style Review — Import Organization**\n\n"
    "🟡 **Import Order (PEP 8):**\n"
    "Imports should be grouped in this order:\n"
    "1. Standard library imports\n"
    "2. Related third-party imports\n"
    "3. Local application/library imports\n\n"
    "Each group should be separated by a blank line.\n\n"
    "🟢 **Suggestions:**\n"
    "- Use `isort` to automatically sort imports\n"
    "- Avoid wildcard imports (`from module import *`)\n"
    "- Prefer absolute imports over relative imports\n\n"
    "**Overall Style Score:** 7/10",
)
style_llm.add_response(
    ["def ", "function", "return", "args", "kwargs"],
    "**Style Review — Function Design**\n\n"
    "🟡 **Function Length:**\n"
    "Some functions appear to be doing too much. Consider breaking them into "
    "smaller, focused functions (aim for < 20 lines each).\n\n"
    "🟡 **Naming:**\n"
    "- Function names should be verbs that describe the action\n"
    "- Parameter names should be descriptive (avoid single-letter names)\n\n"
    "🟢 **Documentation:**\n"
    "- Add docstrings following Google or NumPy style\n"
    "- Include parameter descriptions and return type documentation\n"
    "- Add inline comments for complex logic\n\n"
    "**Overall Style Score:** 6/10",
)
style_llm.add_response(
    ["print", "logging", "logger", "log"],
    "**Style Review — Logging Practices**\n\n"
    "🟡 **Use Logging Instead of Print:**\n"
    "Replace `print()` statements with proper logging:\n"
    "```python\n"
    "import logging\n"
    "logger = logging.getLogger(__name__)\n"
    "logger.info('Processing request for user %s', user_id)\n"
    "```\n\n"
    "🟢 **Best Practices:**\n"
    "- Use appropriate log levels (DEBUG, INFO, WARNING, ERROR)\n"
    "- Use lazy string formatting with `%s` (not f-strings in log calls)\n"
    "- Include contextual information in log messages\n\n"
    "**Overall Style Score:** 7/10",
)

# Logic Reviewer LLM
logic_llm = MockLLM(
    default_response=(
        "**Logic Review**\n\n"
        "Core logic appears sound. Areas to verify:\n\n"
        "- Ensure edge cases are handled (empty inputs, None values, boundary conditions)\n"
        "- Check that error handling covers all failure modes\n"
        "- Verify that return values are consistent across all code paths\n"
        "- Consider adding unit tests for complex logic branches\n\n"
        "**Complexity Score:** Moderate"
    )
)
logic_llm.add_response(
    ["if", "else", "elif", "condition", "branch"],
    "**Logic Review — Conditional Complexity**\n\n"
    "🟡 **Issue 1: Nested Conditionals**\n"
    "Deeply nested if/else blocks reduce readability and increase bug risk. "
    "Consider these refactoring strategies:\n"
    "- Use early returns (guard clauses) to reduce nesting\n"
    "- Extract complex conditions into named boolean variables\n"
    "- Consider the Strategy pattern for multiple branches\n\n"
    "🟡 **Issue 2: Missing Edge Cases**\n"
    "- What happens when the input is `None` or empty?\n"
    "- Are all enum/category values handled?\n"
    "- Is there a sensible default/fallback path?\n\n"
    "🟢 **Recommendation:** Add assertions or type guards at function entry points.\n\n"
    "**Complexity Score:** High",
    priority=5,
)
logic_llm.add_response(
    ["for", "while", "loop", "iterate", "range", "enumerate"],
    "**Logic Review — Loop Analysis**\n\n"
    "🟡 **Issue 1: Loop Efficiency**\n"
    "Review loops for potential performance issues:\n"
    "- Nested loops create O(n²) or worse complexity\n"
    "- Consider using list comprehensions or `map()` for simple transforms\n"
    "- Use generators for large datasets to reduce memory usage\n\n"
    "🟡 **Issue 2: Loop Termination**\n"
    "- Verify all `while` loops have guaranteed termination conditions\n"
    "- Check for potential infinite loops with break conditions\n"
    "- Ensure loop variables aren't modified unexpectedly inside the loop body\n\n"
    "🟢 **Recommendation:** Add bounds checking and consider `itertools` for "
    "complex iteration patterns.\n\n"
    "**Complexity Score:** Moderate–High",
)
logic_llm.add_response(
    ["try", "except", "raise", "error", "exception"],
    "**Logic Review — Error Handling**\n\n"
    "🟡 **Issue 1: Exception Specificity**\n"
    "Avoid bare `except:` or `except Exception:` — catch specific exceptions:\n"
    "```python\n"
    "# Too broad\n"
    "except Exception as e: ...\n\n"
    "# Better — catch what you expect\n"
    "except (ValueError, KeyError) as e: ...\n"
    "```\n\n"
    "🟡 **Issue 2: Error Recovery**\n"
    "- Ensure `finally` blocks are used for cleanup (file handles, connections)\n"
    "- Don't silently swallow exceptions — at minimum, log them\n"
    "- Consider whether to re-raise, wrap, or handle each exception\n\n"
    "🟢 **Recommendation:** Define custom exception classes for domain-specific "
    "errors to improve error handling clarity.\n\n"
    "**Complexity Score:** Moderate",
)
logic_llm.add_response(
    ["async", "await", "asyncio", "concurrent", "thread", "parallel"],
    "**Logic Review — Concurrency Analysis**\n\n"
    "🔴 **Issue 1: Race Conditions**\n"
    "Concurrent code requires careful handling of shared state. Verify:\n"
    "- No shared mutable variables accessed without locks\n"
    "- Async operations properly awaited (no fire-and-forget)\n"
    "- Resource cleanup with `async with` context managers\n\n"
    "🟡 **Issue 2: Deadlock Potential**\n"
    "- Check for circular lock dependencies\n"
    "- Ensure timeouts on all blocking operations\n"
    "- Verify task cancellation is handled gracefully\n\n"
    "**Complexity Score:** High",
    priority=5,
)

# Manager LLM — synthesizes the consolidated report
manager_llm = MockLLM(
    default_response=(
        "## Consolidated Code Review Report\n\n"
        "The code has been reviewed by our specialist agents. "
        "Here is the summary of findings across all review dimensions.\n\n"
        "**Overall Assessment:** The code is functional but has areas for improvement. "
        "Address the critical issues first, then work through the medium-priority items.\n\n"
        "**Priority Actions:**\n"
        "1. Fix any security issues flagged as critical\n"
        "2. Improve error handling and edge case coverage\n"
        "3. Apply style improvements for long-term maintainability\n\n"
        "**Verdict:** Needs Revisions 🟡"
    )
)
manager_llm.add_response(
    ["critical", "🔴"],
    "## Consolidated Code Review Report\n\n"
    "⚠️ **Critical issues were identified that must be addressed before merging.**\n\n"
    "The specialist reviewers found significant concerns — particularly in the "
    "security domain. These issues could lead to vulnerabilities in production.\n\n"
    "**Priority Actions:**\n"
    "1. 🔴 **Immediately** address all critical security findings\n"
    "2. 🟡 Refactor logic to reduce complexity and improve error handling\n"
    "3. 🟢 Apply style improvements for maintainability\n\n"
    "**Verdict:** Request Changes 🔴\n\n"
    "*Do not merge until all critical issues are resolved.*",
    priority=10,
)
manager_llm.add_response(
    ["low", "no critical", "🟢"],
    "## Consolidated Code Review Report\n\n"
    "✅ **No critical issues found. Code is in good shape.**\n\n"
    "The specialist reviewers identified only minor improvements across "
    "security, style, and logic dimensions.\n\n"
    "**Priority Actions:**\n"
    "1. 🟢 Consider the style suggestions for improved readability\n"
    "2. 🟢 Add the recommended edge case handling\n"
    "3. 🟢 Optional: add more comprehensive test coverage\n\n"
    "**Verdict:** Approve with Suggestions 🟢\n\n"
    "*Safe to merge — suggestions are non-blocking.*",
    priority=5,
)


# ---------------------------------------------------------------------------
# Reviewer agent functions — each runs as a child span under the manager
# ---------------------------------------------------------------------------

def security_reviewer(code: str) -> dict:
    """Security reviewer agent — checks for vulnerabilities and unsafe patterns."""
    with agentq.track_agent("security-reviewer") as tracker:
        tracker.set_input({"code_length": len(code), "review_type": "security"})

        # Tool: Static analysis scan
        with agentq.track_tool("static-analysis-scan") as tool:
            tool.set_input({"scan_type": "security", "code_snippet": code[:200]})
            time.sleep(random.uniform(0.1, 0.2))
            scan_results = {
                "scan_type": "security",
                "patterns_checked": [
                    "hardcoded-credentials",
                    "sql-injection",
                    "code-injection",
                    "insecure-deserialization",
                    "ssrf",
                ],
                "lines_scanned": len(code.splitlines()),
            }
            tool.set_output(scan_results)

        # LLM: Analyze code for security issues
        with agentq.track_llm("analyze-security", model="mock-security-reviewer") as llm:
            prompt = f"Review this code for security vulnerabilities:\n{code}"
            llm.set_input({"prompt": prompt[:300]})
            review = security_llm.generate(code)
            llm.set_output({"review": review[:200]})

        result = {
            "reviewer": "🔒 Security",
            "review": review,
            "scan": scan_results,
        }
        tracker.set_output({"reviewer": "security", "review_length": len(review)})
        return result


def style_reviewer(code: str) -> dict:
    """Style reviewer agent — checks naming, formatting, and conventions."""
    with agentq.track_agent("style-reviewer") as tracker:
        tracker.set_input({"code_length": len(code), "review_type": "style"})

        # Tool: Lint check
        with agentq.track_tool("lint-check") as tool:
            tool.set_input({"linter": "ruff", "code_snippet": code[:200]})
            time.sleep(random.uniform(0.05, 0.15))
            lint_results = {
                "linter": "ruff",
                "warnings": random.randint(1, 5),
                "errors": 0,
                "conventions_checked": [
                    "naming-conventions",
                    "import-order",
                    "line-length",
                    "docstrings",
                    "type-hints",
                ],
            }
            tool.set_output(lint_results)

        # LLM: Analyze code style
        with agentq.track_llm("analyze-style", model="mock-style-reviewer") as llm:
            prompt = f"Review this code for style and conventions:\n{code}"
            llm.set_input({"prompt": prompt[:300]})
            review = style_llm.generate(code)
            llm.set_output({"review": review[:200]})

        result = {
            "reviewer": "🎨 Style",
            "review": review,
            "lint": lint_results,
        }
        tracker.set_output({"reviewer": "style", "review_length": len(review)})
        return result


def logic_reviewer(code: str) -> dict:
    """Logic reviewer agent — checks correctness, edge cases, and complexity."""
    with agentq.track_agent("logic-reviewer") as tracker:
        tracker.set_input({"code_length": len(code), "review_type": "logic"})

        # Tool: Complexity analysis
        with agentq.track_tool("complexity-analysis") as tool:
            tool.set_input({"metric": "cyclomatic_complexity", "code_snippet": code[:200]})
            time.sleep(random.uniform(0.1, 0.2))
            complexity_results = {
                "metric": "cyclomatic_complexity",
                "score": random.randint(3, 12),
                "functions_analyzed": max(1, code.count("def ")),
                "branches_detected": code.count("if ") + code.count("elif ") + code.count("else"),
                "loops_detected": code.count("for ") + code.count("while "),
            }
            tool.set_output(complexity_results)

        # LLM: Analyze code logic
        with agentq.track_llm("analyze-logic", model="mock-logic-reviewer") as llm:
            prompt = f"Review this code for correctness and logic issues:\n{code}"
            llm.set_input({"prompt": prompt[:300]})
            review = logic_llm.generate(code)
            llm.set_output({"review": review[:200]})

        result = {
            "reviewer": "🧠 Logic",
            "review": review,
            "complexity": complexity_results,
        }
        tracker.set_output({"reviewer": "logic", "review_length": len(review)})
        return result


# ---------------------------------------------------------------------------
# Manager agent — orchestrates the review delegation
# ---------------------------------------------------------------------------

def review_code(code: str, session_id: str) -> dict:
    """Run a full code review by delegating to specialist reviewers.

    This is the main orchestration function. The Manager agent:
    1. Receives the code from the user
    2. Delegates to Security, Style, and Logic reviewer agents
    3. Consolidates their findings into a final report

    The hierarchy produces this trace topology:
        session → manager-agent → [security-reviewer, style-reviewer, logic-reviewer]
    Each reviewer has its own tool + LLM sub-spans.
    """
    with agentq.session(session_id=session_id, name="code-review-assistant"):
        with agentq.track_agent("manager-agent") as tracker:
            tracker.set_input({
                "code_length": len(code),
                "code_preview": code[:100],
            })

            # Step 1: Delegate to all three reviewers
            security_result = security_reviewer(code)
            style_result = style_reviewer(code)
            logic_result = logic_reviewer(code)

            # Step 2: Consolidate findings
            all_reviews = (
                f"{security_result['review']}\n\n"
                f"{style_result['review']}\n\n"
                f"{logic_result['review']}"
            )

            # Step 3: Manager synthesizes the final report
            with agentq.track_llm("synthesize-report", model="mock-manager") as llm:
                llm.set_input({
                    "security_summary": security_result["review"][:150],
                    "style_summary": style_result["review"][:150],
                    "logic_summary": logic_result["review"][:150],
                })
                consolidated = manager_llm.generate(all_reviews)
                llm.set_output({"report": consolidated[:200]})

            result = {
                "consolidated_report": consolidated,
                "reviews": {
                    "security": security_result,
                    "style": style_result,
                    "logic": logic_result,
                },
            }
            tracker.set_output({
                "reviewers_invoked": 3,
                "report_length": len(consolidated),
            })
            return result


# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------

st.title("🔍 Code Review Assistant")
st.caption(
    "Paste your code below — the Manager agent delegates to Security, Style, "
    "and Logic reviewers. Watch hierarchical traces in AgentQ!"
)

# Sidebar
with st.sidebar:
    st.header("ℹ️ About")
    st.markdown(
        "This app demonstrates the **Hierarchical Delegation** pattern:\n\n"
        "1. A **Manager Agent** receives your code\n"
        "2. It delegates to specialist reviewers:\n"
        "   - 🔒 Security Reviewer\n"
        "   - 🎨 Style Reviewer\n"
        "   - 🧠 Logic Reviewer\n"
        "3. Each reviewer runs tools + LLM analysis\n"
        "4. The Manager consolidates a final report\n\n"
        "Each step is a traced span in AgentQ, forming a "
        "parent-child hierarchy."
    )
    st.divider()
    st.markdown(
        f"**AgentQ Dashboard:** [{st.session_state.agentq_endpoint}]"
        f"({st.session_state.agentq_endpoint})"
    )
    st.divider()
    st.subheader("💡 Try pasting:")
    st.markdown(
        "- Code with `eval()` or `exec()` → triggers security alerts\n"
        "- Code with SQL queries → triggers injection warnings\n"
        "- Code with hardcoded passwords → triggers credential alerts\n"
        "- Code with nested `if/else` → triggers logic complexity notes\n"
        "- Code with `for` loops → triggers loop analysis\n"
        "- Any Python code → gets a general review"
    )

    st.divider()
    st.subheader("📋 Sample Code")
    if st.button("Load example"):
        st.session_state.sample_loaded = True
    if st.session_state.get("sample_loaded"):
        st.code(
            'def get_user(name):\n'
            '    query = f"SELECT * FROM users WHERE name = \'{name}\'"\n'
            '    result = eval(query)\n'
            '    if result:\n'
            '        if result["active"]:\n'
            '            return result\n'
            '        else:\n'
            '            return None\n'
            '    else:\n'
            '        return None',
            language="python",
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
            with st.expander("📋 Show individual reviewer reports"):
                reviews = msg["reviews"]

                st.markdown("### 🔒 Security Reviewer")
                if "scan" in reviews["security"]:
                    scan = reviews["security"]["scan"]
                    st.info(
                        f"🔎 Scanned {scan['lines_scanned']} lines | "
                        f"Patterns checked: {len(scan['patterns_checked'])}"
                    )
                st.markdown(reviews["security"]["review"])

                st.divider()

                st.markdown("### 🎨 Style Reviewer")
                if "lint" in reviews["style"]:
                    lint = reviews["style"]["lint"]
                    st.info(
                        f"🔎 Linter: {lint['linter']} | "
                        f"Warnings: {lint['warnings']} | "
                        f"Errors: {lint['errors']}"
                    )
                st.markdown(reviews["style"]["review"])

                st.divider()

                st.markdown("### 🧠 Logic Reviewer")
                if "complexity" in reviews["logic"]:
                    cx = reviews["logic"]["complexity"]
                    st.info(
                        f"🔎 Complexity: {cx['score']} | "
                        f"Functions: {cx['functions_analyzed']} | "
                        f"Branches: {cx['branches_detected']} | "
                        f"Loops: {cx['loops_detected']}"
                    )
                st.markdown(reviews["logic"]["review"])

# Chat input
if user_input := st.chat_input("Paste code to review..."):
    # Display user message
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)

    # Run the review pipeline
    with st.chat_message("assistant"):
        with st.spinner("🔍 Delegating to reviewers — Security, Style, Logic..."):
            result = review_code(user_input, st.session_state.session_id)

        # Show consolidated report
        st.markdown(result["consolidated_report"])

        # Show individual reviews in an expander
        with st.expander("📋 Show individual reviewer reports"):
            reviews = result["reviews"]

            st.markdown("### 🔒 Security Reviewer")
            scan = reviews["security"]["scan"]
            st.info(
                f"🔎 Scanned {scan['lines_scanned']} lines | "
                f"Patterns checked: {len(scan['patterns_checked'])}"
            )
            st.markdown(reviews["security"]["review"])

            st.divider()

            st.markdown("### 🎨 Style Reviewer")
            lint = reviews["style"]["lint"]
            st.info(
                f"🔎 Linter: {lint['linter']} | "
                f"Warnings: {lint['warnings']} | "
                f"Errors: {lint['errors']}"
            )
            st.markdown(reviews["style"]["review"])

            st.divider()

            st.markdown("### 🧠 Logic Reviewer")
            cx = reviews["logic"]["complexity"]
            st.info(
                f"🔎 Complexity: {cx['score']} | "
                f"Functions: {cx['functions_analyzed']} | "
                f"Branches: {cx['branches_detected']} | "
                f"Loops: {cx['loops_detected']}"
            )
            st.markdown(reviews["logic"]["review"])

    # Save to history
    st.session_state.messages.append({
        "role": "assistant",
        "content": result["consolidated_report"],
        "reviews": result["reviews"],
    })
