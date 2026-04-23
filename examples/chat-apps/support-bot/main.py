"""
Support Bot — Router / Dispatcher Pattern
==========================================

A customer support chatbot that routes user questions to specialist agents.
Demonstrates branching trace topology: one parent span fans out to different
child agent spans depending on the question category.

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
    page_title="Support Bot — AgentQ Demo",
    page_icon="🤖",
    layout="centered",
)


# ---------------------------------------------------------------------------
# AgentQ initialization (once per session)
# ---------------------------------------------------------------------------

if "agentq_initialized" not in st.session_state:
    endpoint = setup_agentq("support-bot-chat-app")
    st.session_state.agentq_initialized = True
    st.session_state.agentq_endpoint = endpoint


# ---------------------------------------------------------------------------
# Mock LLM setup — keyword-based routing and response generation
# ---------------------------------------------------------------------------

# Router LLM — classifies the user question into a category
router_llm = MockLLM(default_response="general")
router_llm.add_response(
    ["bill", "billing", "invoice", "payment", "charge", "subscription",
     "plan", "price", "pricing", "cost", "refund", "cancel", "upgrade",
     "downgrade", "discount", "coupon", "trial", "free tier"],
    "billing",
    priority=10,
)
router_llm.add_response(
    ["error", "bug", "crash", "500", "404", "timeout", "api", "endpoint",
     "webhook", "integration", "configure", "setup", "install", "deploy",
     "debug", "log", "trace", "sdk", "latency", "performance", "slow",
     "broken", "fix", "issue", "problem", "not working", "failed"],
    "technical",
    priority=10,
)

# Billing Agent LLM
billing_llm = MockLLM(
    default_response=(
        "I can help with billing questions! Our plans are:\n\n"
        "- **Free Tier**: Up to 1,000 traces/month, 1 project\n"
        "- **Pro Plan**: $49/month — 50,000 traces/month, unlimited projects\n"
        "- **Enterprise**: Custom pricing — unlimited traces, SSO, dedicated support\n\n"
        "Would you like more details about any specific plan?"
    )
)
billing_llm.add_response(
    ["refund", "money back"],
    "Of course! I can process a refund for you. Our refund policy allows full refunds "
    "within 30 days of purchase. I've initiated the refund process — you should see "
    "the credit on your account within 3–5 business days.\n\n"
    "Is there anything else I can help you with regarding your billing?",
)
billing_llm.add_response(
    ["cancel", "cancellation"],
    "I understand you'd like to cancel your subscription. I can help with that.\n\n"
    "Before I process the cancellation, I want to make sure you know:\n"
    "- Your access continues until the end of your current billing period\n"
    "- All your data will be retained for 30 days after cancellation\n"
    "- You can reactivate anytime\n\n"
    "Shall I go ahead and cancel?",
)
billing_llm.add_response(
    ["upgrade", "pro", "enterprise"],
    "Great choice! Upgrading is easy:\n\n"
    "1. Go to **Settings → Billing** in your dashboard\n"
    "2. Click **Upgrade Plan**\n"
    "3. Select your new plan and confirm\n\n"
    "The upgrade takes effect immediately, and we'll prorate the charge for the "
    "remainder of your billing cycle. Need help with anything else?",
)
billing_llm.add_response(
    ["invoice", "receipt"],
    "You can find all your invoices in **Settings → Billing → Invoice History**.\n\n"
    "Each invoice includes:\n"
    "- Date and amount\n"
    "- Plan details\n"
    "- Payment method used\n"
    "- Downloadable PDF receipt\n\n"
    "Would you like me to look up a specific invoice?",
)

# Technical Support Agent LLM
tech_llm = MockLLM(
    default_response=(
        "I'd be happy to help with your technical issue! Here are some common "
        "troubleshooting steps:\n\n"
        "1. **Check your API key** — make sure it's valid and has the right permissions\n"
        "2. **Verify the endpoint** — the default is `http://localhost:3000`\n"
        "3. **Check the logs** — look for error messages in your application logs\n\n"
        "Could you share more details about the specific error you're seeing?"
    )
)
tech_llm.add_response(
    ["500", "error", "crash", "broken", "not working", "failed"],
    "Let me help you debug that error. Here's a systematic approach:\n\n"
    "**Step 1:** Check if the AgentQ server is running:\n"
    "```bash\ncurl http://localhost:3000/health\n```\n\n"
    "**Step 2:** Verify your SDK initialization:\n"
    "```python\nimport agentq\nagentq.init(endpoint='http://localhost:3000')\n```\n\n"
    "**Step 3:** Check for trace export errors in your logs — look for "
    "`OTLP export failed` messages.\n\n"
    "If the server health check fails, try restarting with `docker compose up -d`.",
)
tech_llm.add_response(
    ["webhook", "configure", "setup", "integration"],
    "Here's how to set up the integration:\n\n"
    "**1. Install the SDK:**\n"
    "```bash\npip install agentq\n```\n\n"
    "**2. Initialize in your code:**\n"
    "```python\nimport agentq\nagentq.init(endpoint='http://localhost:3000', "
    "service_name='my-app')\nagentq.instrument()  # auto-detects frameworks\n```\n\n"
    "**3. Verify traces are arriving:**\n"
    "Open `http://localhost:3000` and look for your service name in the traces view.\n\n"
    "The SDK automatically captures spans from supported frameworks (LangChain, "
    "CrewAI, AutoGen, etc.).",
)
tech_llm.add_response(
    ["slow", "latency", "performance"],
    "Let's diagnose the performance issue:\n\n"
    "**Common causes of slow traces:**\n"
    "1. **Batch export interval** — the SDK batches spans every 5s by default. "
    "You can reduce this for testing.\n"
    "2. **Network latency** — if the AgentQ server is remote, check your network.\n"
    "3. **Large payloads** — if you're tracing very large inputs/outputs, consider "
    "truncating them.\n\n"
    "**Quick fix:** Try setting the environment variable:\n"
    "```bash\nexport OTEL_BSP_SCHEDULE_DELAY=1000  # 1 second batch interval\n```\n\n"
    "This should make traces appear faster in the dashboard.",
)

# FAQ Agent LLM
faq_llm = MockLLM(
    default_response=(
        "AgentQ is an **observability platform for AI agents**. It captures traces "
        "from your multi-agent systems so you can:\n\n"
        "- 🔍 **See** the full execution flow of agent pipelines\n"
        "- 🐛 **Debug** failures by tracing parent-child agent relationships\n"
        "- 📊 **Monitor** LLM token usage, latency, and tool call patterns\n"
        "- 🏷️ **Tag** sessions and runs for organized trace management\n\n"
        "It works with popular frameworks like LangChain, CrewAI, AutoGen, and more. "
        "What would you like to know more about?"
    )
)
faq_llm.add_response(
    ["how does", "how do", "what is", "explain"],
    "Great question! AgentQ works by instrumenting your Python code with "
    "OpenTelemetry-based tracing. Here's how:\n\n"
    "1. **You add the SDK** — `import agentq; agentq.init(...)`\n"
    "2. **You decorate agents** — `@agentq.agent(name='my-agent')`\n"
    "3. **Traces flow automatically** — each agent call, LLM invocation, and tool "
    "use becomes a span\n"
    "4. **You view in the dashboard** — hierarchical trace visualization at "
    "`http://localhost:3000`\n\n"
    "The key insight: nested `@agent` decorators create parent-child span "
    "relationships, so you can see exactly how agents delegate to each other.",
)
faq_llm.add_response(
    ["start", "getting started", "begin", "tutorial"],
    "Here's the fastest way to get started with AgentQ:\n\n"
    "**1. Start the server:**\n"
    "```bash\ncp server/.env.example server/.env\ndocker compose up -d\n```\n\n"
    "**2. Install the SDK:**\n"
    "```bash\npip install agentq\n```\n\n"
    "**3. Try an example:**\n"
    "```bash\ncd examples/chat-apps/support-bot/\npip install -r requirements.txt\n"
    "streamlit run main.py\n```\n\n"
    "**4. View traces:**\n"
    "Open `http://localhost:3000` — you'll see traces from your chat session!",
)


# ---------------------------------------------------------------------------
# Agent functions — each produces spans in AgentQ
# ---------------------------------------------------------------------------

def classify_question(user_message: str) -> str:
    """Use the router LLM to classify the user's question."""
    with agentq.track_llm("classify-question", model="mock-router") as tracker:
        tracker.set_input({"message": user_message})
        category = router_llm.generate(user_message)
        tracker.set_output({"category": category})
        return category


def billing_agent(user_message: str) -> dict:
    """Handle billing-related questions."""
    with agentq.track_agent("billing-agent") as tracker:
        tracker.set_input({"message": user_message})

        # Simulate looking up account info
        with agentq.track_tool("lookup-account") as tool:
            tool.set_input({"action": "fetch_billing_info"})
            time.sleep(random.uniform(0.05, 0.15))
            account_info = {
                "plan": "Pro",
                "billing_cycle": "monthly",
                "next_invoice": "2026-05-01",
            }
            tool.set_output(account_info)

        # Generate response
        with agentq.track_llm("generate-billing-response", model="mock-billing") as llm:
            llm.set_input({"message": user_message, "account": account_info})
            response = billing_llm.generate(user_message)
            llm.set_output({"response": response})

        tracker.set_output({"response": response, "agent": "billing"})
        return {"agent": "💰 Billing", "response": response}


def tech_support_agent(user_message: str) -> dict:
    """Handle technical support questions."""
    with agentq.track_agent("tech-support-agent") as tracker:
        tracker.set_input({"message": user_message})

        # Simulate searching knowledge base
        with agentq.track_tool("search-knowledge-base") as tool:
            tool.set_input({"query": user_message})
            time.sleep(random.uniform(0.05, 0.15))
            kb_results = [
                {"title": "Troubleshooting Guide", "relevance": 0.92},
                {"title": "API Reference", "relevance": 0.85},
            ]
            tool.set_output({"results": kb_results})

        # Generate response
        with agentq.track_llm("generate-tech-response", model="mock-tech") as llm:
            llm.set_input({"message": user_message, "kb_results": kb_results})
            response = tech_llm.generate(user_message)
            llm.set_output({"response": response})

        tracker.set_output({"response": response, "agent": "technical"})
        return {"agent": "🔧 Technical Support", "response": response}


def faq_agent(user_message: str) -> dict:
    """Handle general FAQ questions."""
    with agentq.track_agent("faq-agent") as tracker:
        tracker.set_input({"message": user_message})

        # Generate response
        with agentq.track_llm("generate-faq-response", model="mock-faq") as llm:
            llm.set_input({"message": user_message})
            response = faq_llm.generate(user_message)
            llm.set_output({"response": response})

        tracker.set_output({"response": response, "agent": "faq"})
        return {"agent": "❓ General FAQ", "response": response}


def route_and_respond(user_message: str, session_id: str) -> dict:
    """Route a user message to the appropriate specialist agent.

    This is the main orchestration function. It:
    1. Classifies the question using the router LLM
    2. Dispatches to the appropriate specialist agent
    3. Returns the agent's response

    All steps are traced under a single session in AgentQ.
    """
    with agentq.session(session_id=session_id, name="support-bot"):
        with agentq.track_agent("router-agent") as tracker:
            tracker.set_input({"message": user_message})

            # Step 1: Classify the question
            category = classify_question(user_message)

            # Step 2: Route to specialist
            if category == "billing":
                result = billing_agent(user_message)
            elif category == "technical":
                result = tech_support_agent(user_message)
            else:
                result = faq_agent(user_message)

            result["category"] = category
            tracker.set_output(result)
            return result


# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------

st.title("🤖 Support Bot")
st.caption(
    "Ask a customer support question — the router agent will dispatch it "
    "to the right specialist. Watch traces in AgentQ!"
)

# Sidebar
with st.sidebar:
    st.header("ℹ️ About")
    st.markdown(
        "This app demonstrates the **Router / Dispatcher** pattern:\n\n"
        "1. A **Router Agent** classifies your question\n"
        "2. It dispatches to a **specialist agent**:\n"
        "   - 💰 Billing Agent\n"
        "   - 🔧 Technical Support Agent\n"
        "   - ❓ General FAQ Agent\n"
        "3. The specialist generates a response\n\n"
        "Each step is a traced span in AgentQ."
    )
    st.divider()
    st.markdown(
        f"**AgentQ Dashboard:** [{st.session_state.agentq_endpoint}]"
        f"({st.session_state.agentq_endpoint})"
    )
    st.divider()
    st.subheader("💡 Try asking:")
    st.markdown(
        "- *How much does the pro plan cost?*\n"
        "- *My API keeps returning 500 errors*\n"
        "- *What is AgentQ?*\n"
        "- *I need a refund*\n"
        "- *How do I configure webhooks?*"
    )

# Initialize chat history and session ID
if "messages" not in st.session_state:
    st.session_state.messages = []
if "session_id" not in st.session_state:
    st.session_state.session_id = f"support-bot-{uuid.uuid4().hex[:8]}"

# Display chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        if msg["role"] == "assistant" and "agent" in msg:
            st.caption(f"Routed to: {msg['agent']}")
        st.markdown(msg["content"])

# Chat input
if user_input := st.chat_input("Ask a support question..."):
    # Display user message
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)

    # Get response from the agent pipeline
    with st.chat_message("assistant"):
        with st.spinner("Routing your question..."):
            result = route_and_respond(user_input, st.session_state.session_id)

        st.caption(f"Routed to: {result['agent']}")
        st.markdown(result["response"])

    # Save to history
    st.session_state.messages.append({
        "role": "assistant",
        "content": result["response"],
        "agent": result["agent"],
    })
