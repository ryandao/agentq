"""
Research Assistant — Sequential Pipeline Pattern
=================================================

A research assistant that processes user questions through a sequential
agent pipeline: Researcher → Analyzer → Writer. Demonstrates linear trace
chain topology — each agent hands off to the next.

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
    page_title="Research Assistant — AgentQ Demo",
    page_icon="🔬",
    layout="centered",
)


# ---------------------------------------------------------------------------
# AgentQ initialization (once per session)
# ---------------------------------------------------------------------------

if "agentq_initialized" not in st.session_state:
    endpoint = setup_agentq("research-assistant-chat-app")
    st.session_state.agentq_initialized = True
    st.session_state.agentq_endpoint = endpoint


# ---------------------------------------------------------------------------
# Mock LLM setup for each pipeline stage
# ---------------------------------------------------------------------------

# Researcher LLM — summarizes search results
researcher_llm = MockLLM(
    default_response=(
        "Based on available sources, here are the key findings:\n\n"
        "1. The topic has seen significant recent developments\n"
        "2. Multiple authoritative sources provide complementary perspectives\n"
        "3. There are both established principles and emerging trends to consider"
    )
)
researcher_llm.add_response(
    ["microservice", "micro-service", "distributed"],
    "Source analysis summary:\n\n"
    "1. Martin Fowler's seminal article defines microservices as independently "
    "deployable services organized around business capabilities\n"
    "2. Netflix and Amazon case studies show microservices enabling 10x deployment "
    "frequency\n"
    "3. Recent surveys indicate 85% of enterprises are adopting or planning "
    "microservices\n"
    "4. Trade-offs include increased operational complexity and the need for "
    "robust observability",
)
researcher_llm.add_response(
    ["quantum", "qubit"],
    "Source analysis summary:\n\n"
    "1. IBM and Google have achieved quantum advantage for specific computational "
    "problems\n"
    "2. Quantum computing uses qubits that can exist in superposition, enabling "
    "parallel computation\n"
    "3. Current systems have 1000+ qubits but error rates remain a challenge\n"
    "4. Applications include cryptography, drug discovery, and optimization problems",
)
researcher_llm.add_response(
    ["machine learning", "ml", "neural", "deep learning", "ai"],
    "Source analysis summary:\n\n"
    "1. Machine learning systems learn patterns from data rather than following "
    "explicit rules\n"
    "2. Transformer architectures have revolutionized NLP and are extending to "
    "vision and multimodal tasks\n"
    "3. Training requires large datasets and significant compute resources\n"
    "4. Key challenges include bias, interpretability, and deployment at scale",
)

# Analyzer LLM — extracts themes and insights
analyzer_llm = MockLLM(
    default_response=(
        "Key themes identified:\n\n"
        "**Theme 1: Foundational Concepts** — The topic rests on well-established "
        "principles that have been validated across multiple domains.\n\n"
        "**Theme 2: Recent Evolution** — Significant advances in the past 2-3 years "
        "have expanded the practical applications.\n\n"
        "**Theme 3: Trade-offs** — Adoption involves balancing benefits against "
        "complexity, cost, and organizational readiness."
    )
)
analyzer_llm.add_response(
    ["microservice", "independently deployable", "business capabilities"],
    "Key themes identified:\n\n"
    "**Theme 1: Independence & Autonomy** — Each service owns its data and "
    "deployment lifecycle, enabling teams to move independently.\n\n"
    "**Theme 2: Scalability** — Horizontal scaling of individual services based on "
    "demand, rather than scaling the entire monolith.\n\n"
    "**Theme 3: Observability Tax** — The distributed nature creates a significant "
    "need for tracing, logging, and monitoring across service boundaries.",
)
analyzer_llm.add_response(
    ["quantum", "qubit", "superposition"],
    "Key themes identified:\n\n"
    "**Theme 1: Quantum Advantage** — Certain problems (factoring, simulation, "
    "optimization) can be solved exponentially faster with quantum computers.\n\n"
    "**Theme 2: Hardware Challenges** — Error correction and qubit stability "
    "remain the primary barriers to practical quantum computing.\n\n"
    "**Theme 3: Hybrid Approaches** — Near-term value comes from quantum-classical "
    "hybrid algorithms that leverage existing infrastructure.",
)
analyzer_llm.add_response(
    ["machine learning", "patterns from data", "transformer"],
    "Key themes identified:\n\n"
    "**Theme 1: Data-Driven Intelligence** — ML systems derive capabilities from "
    "data patterns rather than hard-coded rules, enabling adaptability.\n\n"
    "**Theme 2: Scale as a Feature** — Larger models and datasets consistently "
    "unlock new capabilities (emergent behavior).\n\n"
    "**Theme 3: Responsible Deployment** — Bias mitigation, interpretability, and "
    "safety are essential considerations for production ML systems.",
)

# Writer LLM — composes the final response
writer_llm = MockLLM(
    default_response=(
        "Based on current research and analysis, here's a comprehensive overview:\n\n"
        "The field has evolved significantly, with foundational principles now "
        "well-established and recent innovations expanding the frontier. "
        "Practitioners should focus on understanding the core concepts while "
        "staying current with emerging trends.\n\n"
        "**Key takeaways:**\n"
        "- The fundamentals remain essential — build a strong foundation first\n"
        "- Recent developments have created new opportunities and use cases\n"
        "- Success requires balancing innovation with pragmatic trade-offs\n\n"
        "For deeper exploration, consider starting with the foundational literature "
        "and then examining recent case studies from industry leaders."
    )
)
writer_llm.add_response(
    ["independence", "autonomy", "scalability", "observability tax"],
    "## The Benefits of Microservices\n\n"
    "Microservices architecture has become the dominant approach for building "
    "large-scale applications, and for good reason. Here's what the research shows:\n\n"
    "### 🚀 Independent Deployment\n"
    "Each microservice can be developed, tested, and deployed independently. This "
    "means your billing team can ship updates to the payment service without waiting "
    "for the user management team. Netflix deploys thousands of times per day using "
    "this approach.\n\n"
    "### 📈 Targeted Scalability\n"
    "Instead of scaling your entire application, you scale only the services that "
    "need it. Your search service getting hammered? Scale just that one. This leads "
    "to more efficient resource usage and lower costs.\n\n"
    "### 🔍 The Observability Imperative\n"
    "The biggest trade-off is complexity. When a request flows through 5 different "
    "services, debugging requires distributed tracing — tools like AgentQ that "
    "capture the full request path across service boundaries.\n\n"
    "**Bottom line:** Microservices unlock speed and scalability, but invest in "
    "observability from day one.",
)
writer_llm.add_response(
    ["quantum advantage", "hardware challenges", "hybrid"],
    "## Quantum Computing Explained\n\n"
    "Quantum computing represents a fundamental shift in how we process information. "
    "Here's what you need to know:\n\n"
    "### ⚛️ The Quantum Difference\n"
    "Classical computers use bits (0 or 1). Quantum computers use *qubits* that can "
    "be both 0 and 1 simultaneously (superposition). When qubits are entangled, "
    "operations on one instantly affect others — enabling massive parallelism for "
    "certain problem types.\n\n"
    "### 🏔️ Current Challenges\n"
    "Today's quantum computers are noisy — qubits are fragile and prone to errors. "
    "IBM's latest processors have 1000+ qubits, but we need millions of "
    "error-corrected qubits for the most impactful applications.\n\n"
    "### 🔄 The Hybrid Path Forward\n"
    "The near-term value comes from hybrid quantum-classical algorithms. These use "
    "quantum processors for the parts of a problem they're good at, while classical "
    "computers handle the rest.\n\n"
    "**Bottom line:** Quantum computing is real and advancing rapidly, but "
    "practical widespread impact is still 5-10 years away for most applications.",
)
writer_llm.add_response(
    ["data-driven", "scale as a feature", "responsible deployment"],
    "## How Machine Learning Works\n\n"
    "Machine learning is the technology behind everything from voice assistants to "
    "self-driving cars. Here's the essence:\n\n"
    "### 🧠 Learning from Data\n"
    "Instead of programming explicit rules, ML systems discover patterns in data. "
    "Show a model millions of photos labeled 'cat' or 'dog,' and it learns to "
    "distinguish them — without anyone coding the rules for what makes a cat a cat.\n\n"
    "### 📊 Scale Unlocks Capability\n"
    "A remarkable finding: making models bigger and training on more data doesn't "
    "just improve accuracy — it unlocks entirely new capabilities. GPT-3 could "
    "write code; GPT-4 could reason about images. This 'scaling law' has driven "
    "the current AI revolution.\n\n"
    "### ⚖️ The Responsibility Factor\n"
    "ML models can inherit biases from training data, and their decisions aren't "
    "always explainable. Building responsible AI requires careful dataset curation, "
    "bias testing, and human oversight.\n\n"
    "**Bottom line:** ML learns patterns from data at scale, and its capabilities "
    "grow with size — but responsible deployment requires intentional effort.",
)


# ---------------------------------------------------------------------------
# Pipeline agent functions
# ---------------------------------------------------------------------------

def researcher_agent(question: str) -> dict:
    """Stage 1: Research — gather and summarize sources."""
    with agentq.track_agent("researcher-agent") as tracker:
        tracker.set_input({"question": question})

        # Tool: Web search
        with agentq.track_tool("web-search") as tool:
            tool.set_input({"query": question})
            time.sleep(random.uniform(0.1, 0.2))
            sources = [
                {"title": f"Source on: {question[:40]}", "url": "https://example.com/1", "relevance": 0.95},
                {"title": f"Research paper: {question[:30]}", "url": "https://example.com/2", "relevance": 0.88},
                {"title": f"Industry report: {question[:25]}", "url": "https://example.com/3", "relevance": 0.82},
            ]
            tool.set_output({"source_count": len(sources), "sources": sources})

        # LLM: Summarize sources
        with agentq.track_llm("summarize-sources", model="mock-researcher") as llm:
            prompt = f"Summarize key findings about: {question}\nSources: {sources}"
            llm.set_input({"prompt": prompt})
            summary = researcher_llm.generate(question)
            llm.set_output({"summary": summary})

        result = {
            "sources": sources,
            "summary": summary,
            "source_count": len(sources),
        }
        tracker.set_output(result)
        return result


def analyzer_agent(research: dict, question: str) -> dict:
    """Stage 2: Analyze — extract themes and assess confidence."""
    with agentq.track_agent("analyzer-agent") as tracker:
        tracker.set_input({"summary": research["summary"], "source_count": research["source_count"]})

        # LLM: Extract themes
        with agentq.track_llm("extract-themes", model="mock-analyzer") as llm:
            prompt = f"Identify key themes from this research: {research['summary']}"
            llm.set_input({"prompt": prompt})
            themes = analyzer_llm.generate(research["summary"])
            llm.set_output({"themes": themes})

        # Tool: Assess confidence
        with agentq.track_tool("assess-confidence") as tool:
            tool.set_input({
                "source_count": research["source_count"],
                "themes_extracted": themes[:100],
            })
            time.sleep(random.uniform(0.05, 0.1))
            confidence = min(0.95, 0.6 + (research["source_count"] * 0.1))
            assessment = {
                "confidence_score": confidence,
                "source_quality": "high" if confidence > 0.8 else "moderate",
                "coverage": "comprehensive" if research["source_count"] >= 3 else "partial",
            }
            tool.set_output(assessment)

        result = {
            "themes": themes,
            "confidence": assessment,
        }
        tracker.set_output(result)
        return result


def writer_agent(analysis: dict, question: str) -> dict:
    """Stage 3: Write — compose the final response."""
    with agentq.track_agent("writer-agent") as tracker:
        tracker.set_input({"themes": analysis["themes"][:200], "question": question})

        # LLM: Plan response structure
        with agentq.track_llm("plan-response", model="mock-writer") as llm:
            prompt = f"Plan a response structure for: {question}\nThemes: {analysis['themes']}"
            llm.set_input({"prompt": prompt})
            time.sleep(random.uniform(0.05, 0.1))
            plan = "Structure: Introduction → Key Points → Analysis → Conclusion"
            llm.set_output({"plan": plan})

        # LLM: Compose answer
        with agentq.track_llm("compose-answer", model="mock-writer") as llm:
            prompt = f"Write a comprehensive answer about: {question}\nThemes: {analysis['themes']}"
            llm.set_input({"prompt": prompt, "plan": plan})
            answer = writer_llm.generate(analysis["themes"])
            llm.set_output({"answer": answer, "word_count": len(answer.split())})

        result = {
            "answer": answer,
            "word_count": len(answer.split()),
        }
        tracker.set_output(result)
        return result


def run_pipeline(question: str, session_id: str) -> dict:
    """Run the full research pipeline: Researcher → Analyzer → Writer.

    All stages are traced as a sequential pipeline under a single session.
    """
    with agentq.session(session_id=session_id, name="research-assistant"):
        with agentq.track_agent("pipeline-orchestrator") as tracker:
            tracker.set_input({"question": question})

            # Stage 1: Research
            research = researcher_agent(question)

            # Stage 2: Analyze
            analysis = analyzer_agent(research, question)

            # Stage 3: Write
            output = writer_agent(analysis, question)

            result = {
                "answer": output["answer"],
                "word_count": output["word_count"],
                "stages": {
                    "research": {
                        "source_count": research["source_count"],
                        "summary": research["summary"],
                    },
                    "analysis": {
                        "themes": analysis["themes"],
                        "confidence": analysis["confidence"],
                    },
                    "writing": {
                        "word_count": output["word_count"],
                    },
                },
            }
            tracker.set_output({"word_count": output["word_count"]})
            return result


# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------

st.title("🔬 Research Assistant")
st.caption(
    "Ask a research question — it flows through Researcher → Analyzer → Writer "
    "agents. Watch the pipeline traces in AgentQ!"
)

# Sidebar
with st.sidebar:
    st.header("ℹ️ About")
    st.markdown(
        "This app demonstrates the **Sequential Pipeline** pattern:\n\n"
        "1. 🔍 **Researcher Agent** — gathers and summarizes sources\n"
        "2. 📊 **Analyzer Agent** — extracts themes and assesses confidence\n"
        "3. ✍️ **Writer Agent** — composes the final answer\n\n"
        "Each stage hands off to the next, forming a linear trace chain in AgentQ."
    )
    st.divider()
    st.markdown(
        f"**AgentQ Dashboard:** [{st.session_state.agentq_endpoint}]"
        f"({st.session_state.agentq_endpoint})"
    )
    st.divider()
    st.subheader("💡 Try asking:")
    st.markdown(
        "- *What are the benefits of microservices?*\n"
        "- *Explain quantum computing*\n"
        "- *How does machine learning work?*\n"
        "- *What is observability?*"
    )

# Initialize chat history and session ID
if "messages" not in st.session_state:
    st.session_state.messages = []
if "session_id" not in st.session_state:
    st.session_state.session_id = f"research-{uuid.uuid4().hex[:8]}"

# Display chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg["role"] == "assistant" and "stages" in msg:
            with st.expander("🔍 Show agent steps"):
                stages = msg["stages"]

                st.markdown("**Stage 1: Researcher Agent**")
                st.info(f"📚 Found {stages['research']['source_count']} sources")
                st.text(stages["research"]["summary"])

                st.markdown("**Stage 2: Analyzer Agent**")
                conf = stages["analysis"]["confidence"]
                st.info(
                    f"📊 Confidence: {conf['confidence_score']:.0%} | "
                    f"Quality: {conf['source_quality']} | "
                    f"Coverage: {conf['coverage']}"
                )
                st.text(stages["analysis"]["themes"])

                st.markdown("**Stage 3: Writer Agent**")
                st.info(f"✍️ Composed {stages['writing']['word_count']} words")

# Chat input
if user_input := st.chat_input("Ask a research question..."):
    # Display user message
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)

    # Run the pipeline
    with st.chat_message("assistant"):
        with st.spinner("🔍 Researching → 📊 Analyzing → ✍️ Writing..."):
            result = run_pipeline(user_input, st.session_state.session_id)

        st.markdown(result["answer"])

        # Show agent steps in an expander
        with st.expander("🔍 Show agent steps"):
            stages = result["stages"]

            st.markdown("**Stage 1: Researcher Agent**")
            st.info(f"📚 Found {stages['research']['source_count']} sources")
            st.text(stages["research"]["summary"])

            st.markdown("**Stage 2: Analyzer Agent**")
            conf = stages["analysis"]["confidence"]
            st.info(
                f"📊 Confidence: {conf['confidence_score']:.0%} | "
                f"Quality: {conf['source_quality']} | "
                f"Coverage: {conf['coverage']}"
            )
            st.text(stages["analysis"]["themes"])

            st.markdown("**Stage 3: Writer Agent**")
            st.info(f"✍️ Composed {stages['writing']['word_count']} words")

    # Save to history
    st.session_state.messages.append({
        "role": "assistant",
        "content": result["answer"],
        "stages": result["stages"],
    })
