"""
Debate Arena — Collaborative / Discussion Pattern
===================================================

Multiple expert agents (Optimist, Skeptic, Pragmatist) debate a user's topic
in rounds, then a Moderator agent synthesizes a balanced conclusion.

Demonstrates multi-round collaborative traces — multiple agent spans with
back-and-forth interactions visible in AgentQ.

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
    page_title="Debate Arena — AgentQ Demo",
    page_icon="🏛️",
    layout="centered",
)


# ---------------------------------------------------------------------------
# AgentQ initialization (once per session)
# ---------------------------------------------------------------------------

if "agentq_initialized" not in st.session_state:
    endpoint = setup_agentq("debate-arena-chat-app")
    st.session_state.agentq_initialized = True
    st.session_state.agentq_endpoint = endpoint


# ---------------------------------------------------------------------------
# Mock LLM setup for each debater + moderator
# ---------------------------------------------------------------------------

# Optimist LLM — sees the upside and potential
optimist_llm = MockLLM(
    default_response=(
        "I see tremendous potential here! Every challenge is an opportunity "
        "in disguise. The key is to focus on the possibilities rather than "
        "the limitations. History shows that bold ideas — even controversial "
        "ones — often lead to breakthrough innovations."
    )
)
optimist_llm.add_response(
    ["ai", "artificial intelligence", "machine learning", "automation"],
    "AI is one of the most exciting developments of our time! 🚀\n\n"
    "Consider the possibilities:\n"
    "- **Healthcare:** AI is already detecting cancers earlier than human doctors\n"
    "- **Education:** Personalized learning adapts to each student's pace\n"
    "- **Productivity:** Automation frees humans to focus on creative, meaningful work\n"
    "- **Science:** AI accelerates drug discovery and climate modeling\n\n"
    "Yes, there are challenges, but the potential to improve billions of lives "
    "far outweighs the risks. We should embrace AI enthusiastically while "
    "investing in responsible development.",
    priority=10,
)
optimist_llm.add_response(
    ["remote work", "work from home", "wfh", "hybrid", "office"],
    "Remote work is a revolution in how we think about employment! 🌍\n\n"
    "The benefits are compelling:\n"
    "- **Talent access:** Companies can hire the best people regardless of location\n"
    "- **Work-life balance:** No commute means more time for family and health\n"
    "- **Inclusion:** People with disabilities or caregiving duties can participate fully\n"
    "- **Environmental:** Fewer commuters means lower carbon emissions\n\n"
    "The data shows remote workers are often *more* productive. The future of work "
    "is flexible, and that's something to celebrate!",
    priority=10,
)
optimist_llm.add_response(
    ["crypto", "blockchain", "bitcoin", "web3", "decentralized"],
    "Blockchain technology has the power to democratize finance! 💡\n\n"
    "Look at the opportunities:\n"
    "- **Financial inclusion:** 1.7 billion unbanked people could access financial services\n"
    "- **Transparency:** Immutable records reduce fraud and corruption\n"
    "- **Ownership:** Creators can monetize directly without middlemen\n"
    "- **Innovation:** Smart contracts enable entirely new business models\n\n"
    "We're still early — like the internet in 1995. The speculation will settle, "
    "and the transformative applications will emerge.",
    priority=10,
)
optimist_llm.add_response(
    ["climate", "environment", "green", "sustainable", "energy", "solar", "renewable"],
    "The green transition is the biggest economic opportunity of the century! 🌱\n\n"
    "The momentum is unstoppable:\n"
    "- **Solar costs** have dropped 90% in a decade — it's now the cheapest energy source\n"
    "- **Electric vehicles** are reaching price parity with gas cars\n"
    "- **Green jobs** are growing 3x faster than the overall economy\n"
    "- **Innovation:** New battery tech, carbon capture, and green hydrogen are scaling fast\n\n"
    "The transition creates far more jobs than it displaces. Countries that lead "
    "in green tech will dominate the next economic era.",
    priority=10,
)

# Skeptic LLM — challenges assumptions, identifies risks
skeptic_llm = MockLLM(
    default_response=(
        "Let's pump the brakes and think critically about this. Every "
        "exciting narrative has hidden downsides that advocates prefer to "
        "ignore. Before we rush forward, we need to ask the hard questions "
        "about who benefits, who bears the risk, and what could go wrong."
    )
)
skeptic_llm.add_response(
    ["ai", "artificial intelligence", "machine learning", "automation"],
    "We need a serious reality check on AI. ⚠️\n\n"
    "The concerns are substantial:\n"
    "- **Job displacement:** McKinsey estimates 800 million jobs could be automated by 2030\n"
    "- **Bias:** AI systems perpetuate and amplify existing societal biases\n"
    "- **Concentration of power:** A handful of tech giants control AI development\n"
    "- **Existential risk:** Even AI researchers warn about alignment problems\n\n"
    "The hype cycle is in overdrive. We're told AI will solve everything, but "
    "we haven't solved the problems AI *creates.* Regulation is years behind "
    "the technology. Proceed with extreme caution.",
    priority=10,
)
skeptic_llm.add_response(
    ["remote work", "work from home", "wfh", "hybrid", "office"],
    "Remote work isn't the utopia it's being sold as. 🤔\n\n"
    "Let's look at the downsides honestly:\n"
    "- **Isolation:** Mental health issues have spiked among remote workers\n"
    "- **Career penalty:** Remote workers get promoted less often (proximity bias)\n"
    "- **Collaboration loss:** Innovation often comes from unplanned in-person interactions\n"
    "- **Inequality:** Knowledge workers benefit while service workers can't work remotely\n\n"
    "The productivity studies are mixed at best. Many show an initial spike followed "
    "by decline. And the erosion of company culture is a slow-motion disaster "
    "that won't show up in quarterly metrics.",
    priority=10,
)
skeptic_llm.add_response(
    ["crypto", "blockchain", "bitcoin", "web3", "decentralized"],
    "Crypto has been more hype than substance. 📉\n\n"
    "The track record speaks for itself:\n"
    "- **Speculation:** The vast majority of crypto activity is speculative gambling\n"
    "- **Scams:** Billions lost to rug pulls, hacks, and Ponzi schemes\n"
    "- **Environment:** Bitcoin mining consumes more energy than many countries\n"
    "- **Adoption:** After 15 years, everyday crypto payments remain negligible\n\n"
    "The 'financial inclusion' narrative is largely marketing. Most crypto wealth "
    "is concentrated in the hands of early adopters and whales. We should be "
    "skeptical of any technology that primarily enriches its evangelists.",
    priority=10,
)
skeptic_llm.add_response(
    ["climate", "environment", "green", "sustainable", "energy", "solar", "renewable"],
    "The green transition narrative needs a dose of realism. 🔍\n\n"
    "Uncomfortable truths:\n"
    "- **Mineral dependence:** EVs and batteries require lithium, cobalt, and rare earths — "
    "often mined in exploitative conditions\n"
    "- **Grid reliability:** Intermittent renewables create grid stability challenges\n"
    "- **Cost burden:** The transition disproportionately impacts low-income households\n"
    "- **Timeline:** We're nowhere near the pace needed to meet Paris Agreement targets\n\n"
    "Optimistic projections consistently overpromise and underdeliver. The real "
    "challenge isn't technology — it's political will, economic disruption, and "
    "the massive infrastructure overhaul required.",
    priority=10,
)

# Pragmatist LLM — finds the middle ground, focuses on practical solutions
pragmatist_llm = MockLLM(
    default_response=(
        "Both sides make valid points. The truth, as usual, lies somewhere "
        "in the middle. Rather than debating extremes, let's focus on what "
        "practical steps we can take today that account for both the "
        "opportunities and the risks."
    )
)
pragmatist_llm.add_response(
    ["ai", "artificial intelligence", "machine learning", "automation"],
    "Both the excitement and the concern about AI are warranted. Here's "
    "a practical view: ⚖️\n\n"
    "**What to embrace:**\n"
    "- AI as a *tool* that augments human capabilities (not replaces them)\n"
    "- Investment in AI safety research alongside capabilities research\n"
    "- Gradual adoption with human oversight in high-stakes domains\n\n"
    "**What to address:**\n"
    "- Reskilling programs for workers in automatable roles\n"
    "- Mandatory bias audits for AI systems in hiring, lending, and criminal justice\n"
    "- Antitrust measures to prevent AI monopolies\n\n"
    "The question isn't whether AI will transform society — it will. "
    "The question is whether we shape that transformation or let it happen to us.",
    priority=10,
)
pragmatist_llm.add_response(
    ["remote work", "work from home", "wfh", "hybrid", "office"],
    "The remote work debate has a sensible middle ground: ⚖️\n\n"
    "**What works:**\n"
    "- Hybrid models (2–3 days in office) combine the best of both worlds\n"
    "- Async communication tools reduce unnecessary meetings\n"
    "- Results-based evaluation (not hours logged) is overdue regardless\n\n"
    "**What needs fixing:**\n"
    "- Intentional team rituals to maintain culture and connection\n"
    "- Equal promotion pathways for remote and in-office workers\n"
    "- Manager training for leading distributed teams effectively\n\n"
    "The answer isn't 'fully remote' or 'back to the office.' It's building "
    "a flexible system with clear expectations and the right tools.",
    priority=10,
)
pragmatist_llm.add_response(
    ["crypto", "blockchain", "bitcoin", "web3", "decentralized"],
    "Blockchain has real potential, but it needs a reality adjustment: ⚖️\n\n"
    "**Where it makes sense:**\n"
    "- Supply chain verification and provenance tracking\n"
    "- Cross-border payments (especially for underserved regions)\n"
    "- Digital identity and credential verification\n\n"
    "**Where skepticism is warranted:**\n"
    "- Speculative tokens with no underlying utility\n"
    "- 'Decentralization' claims that mask centralized control\n"
    "- Environmental costs of proof-of-work systems\n\n"
    "The technology is a tool — neither savior nor scam. Focus on specific "
    "use cases with clear advantages over existing solutions.",
    priority=10,
)
pragmatist_llm.add_response(
    ["climate", "environment", "green", "sustainable", "energy", "solar", "renewable"],
    "Climate action needs pragmatic optimism combined with honest planning: ⚖️\n\n"
    "**What's working:**\n"
    "- Renewables are cost-competitive — market forces now favor green energy\n"
    "- Electric vehicles are viable for most consumers\n"
    "- Corporate commitments are driving supply chain decarbonization\n\n"
    "**What needs realism:**\n"
    "- Transition support for displaced fossil fuel workers and communities\n"
    "- Grid modernization must keep pace with renewable deployment\n"
    "- Nuclear should be part of the baseload conversation\n\n"
    "The green transition will happen, but its speed and fairness depend on "
    "policies that address both the opportunities and the disruption.",
    priority=10,
)

# Moderator LLM — synthesizes the debate
moderator_llm = MockLLM(
    default_response=(
        "## 🏛️ Moderator's Synthesis\n\n"
        "After hearing from all three perspectives, here's a balanced take:\n\n"
        "The Optimist highlights genuine potential that shouldn't be dismissed. "
        "The Skeptic raises valid concerns that need addressing. The Pragmatist "
        "offers a realistic path forward.\n\n"
        "**Key insight:** Progress and caution aren't opposites — they're "
        "complementary. The best outcomes come from pursuing opportunity "
        "while actively managing risk.\n\n"
        "**Recommended approach:** Move forward with measured enthusiasm, "
        "invest in safeguards, and regularly reassess as new evidence emerges."
    )
)
moderator_llm.add_response(
    ["ai", "artificial intelligence", "machine learning", "automation"],
    "## 🏛️ Moderator's Synthesis: The AI Debate\n\n"
    "This debate crystallized three important truths:\n\n"
    "1. **AI's potential is real** — The Optimist is right that AI is already "
    "saving lives in healthcare and accelerating scientific discovery.\n\n"
    "2. **The risks are equally real** — The Skeptic correctly identifies "
    "job displacement, bias, and power concentration as serious concerns.\n\n"
    "3. **The path forward is intentional** — The Pragmatist's framework of "
    "'augment, don't replace' with strong oversight is the most actionable.\n\n"
    "**Verdict:** AI development should continue, but with mandatory safety "
    "research, bias audits, worker transition programs, and democratic "
    "governance. The goal is AI that benefits everyone, not just those "
    "building it.",
    priority=10,
)
moderator_llm.add_response(
    ["remote work", "work from home", "wfh", "hybrid", "office"],
    "## 🏛️ Moderator's Synthesis: The Remote Work Debate\n\n"
    "This debate revealed a clear consensus direction:\n\n"
    "1. **Flexibility is here to stay** — The Optimist's evidence on "
    "talent access and inclusion is compelling.\n\n"
    "2. **Connection still matters** — The Skeptic's concerns about "
    "isolation and collaboration loss are backed by emerging research.\n\n"
    "3. **Hybrid is the answer** — The Pragmatist's '2–3 days in office' "
    "model addresses both sides' core concerns.\n\n"
    "**Verdict:** The future of work is hybrid, with intentional in-person "
    "time for collaboration and culture, combined with remote flexibility "
    "for focus and inclusion. Success requires new management skills and "
    "deliberate investment in team cohesion.",
    priority=10,
)
moderator_llm.add_response(
    ["crypto", "blockchain", "bitcoin", "web3", "decentralized"],
    "## 🏛️ Moderator's Synthesis: The Crypto Debate\n\n"
    "This debate drew sharper lines than most topics:\n\n"
    "1. **The technology has merit** — The Optimist's points about financial "
    "inclusion and transparency apply to *specific use cases.*\n\n"
    "2. **The speculation is harmful** — The Skeptic's evidence on scams, "
    "environmental damage, and wealth concentration is well-documented.\n\n"
    "3. **Use-case focus is key** — The Pragmatist wisely separates the "
    "technology from the speculation.\n\n"
    "**Verdict:** Support blockchain for verified, high-value use cases "
    "(supply chain, cross-border payments, identity). Apply strict consumer "
    "protection to speculative assets. Judge projects by utility delivered, "
    "not tokens traded.",
    priority=10,
)
moderator_llm.add_response(
    ["climate", "environment", "green", "sustainable", "energy", "solar", "renewable"],
    "## 🏛️ Moderator's Synthesis: The Climate Debate\n\n"
    "This debate showed more agreement than disagreement:\n\n"
    "1. **The transition is inevitable** — Even the Skeptic doesn't argue "
    "against green energy, only its pace and costs.\n\n"
    "2. **Costs and fairness matter** — The Skeptic rightly insists on "
    "addressing the transition's burden on vulnerable communities.\n\n"
    "3. **Pragmatic acceleration works** — Market forces, smart policy, and "
    "technology are converging in the right direction.\n\n"
    "**Verdict:** Accelerate the green transition while investing heavily in "
    "worker retraining, grid modernization, and just-transition policies. "
    "Include nuclear in the energy mix. The cost of inaction far exceeds "
    "the cost of transition.",
    priority=10,
)


# ---------------------------------------------------------------------------
# Agent functions — each produces spans in AgentQ
# ---------------------------------------------------------------------------

NUM_ROUNDS = 2  # Number of debate rounds


def optimist_agent(topic: str, round_num: int, context: str) -> dict:
    """Optimist expert — sees potential and upside."""
    with agentq.track_agent("optimist-agent") as tracker:
        tracker.set_input({
            "topic": topic[:100],
            "round": round_num,
            "context_length": len(context),
        })

        # Tool: research positive evidence
        with agentq.track_tool("research-positive-evidence") as tool:
            tool.set_input({"topic": topic[:100], "focus": "benefits"})
            time.sleep(random.uniform(0.05, 0.1))
            evidence = {
                "sources_found": random.randint(3, 7),
                "sentiment": "positive",
                "confidence": round(random.uniform(0.75, 0.95), 2),
            }
            tool.set_output(evidence)

        # LLM: generate optimistic perspective
        with agentq.track_llm("generate-optimist-view", model="mock-optimist") as llm:
            prompt = f"Round {round_num}: Give an optimistic take on: {topic}"
            if context:
                prompt += f"\nPrevious discussion: {context[:200]}"
            llm.set_input({"prompt": prompt[:300]})
            response = optimist_llm.generate(topic)
            llm.set_output({"response": response[:200]})

        result = {
            "speaker": "🌟 Optimist",
            "response": response,
            "round": round_num,
            "evidence": evidence,
        }
        tracker.set_output({"response_length": len(response), "round": round_num})
        return result


def skeptic_agent(topic: str, round_num: int, context: str) -> dict:
    """Skeptic expert — challenges assumptions and identifies risks."""
    with agentq.track_agent("skeptic-agent") as tracker:
        tracker.set_input({
            "topic": topic[:100],
            "round": round_num,
            "context_length": len(context),
        })

        # Tool: research counterarguments
        with agentq.track_tool("research-counterarguments") as tool:
            tool.set_input({"topic": topic[:100], "focus": "risks"})
            time.sleep(random.uniform(0.05, 0.1))
            evidence = {
                "sources_found": random.randint(3, 7),
                "sentiment": "critical",
                "confidence": round(random.uniform(0.75, 0.95), 2),
            }
            tool.set_output(evidence)

        # LLM: generate skeptical perspective
        with agentq.track_llm("generate-skeptic-view", model="mock-skeptic") as llm:
            prompt = f"Round {round_num}: Give a skeptical take on: {topic}"
            if context:
                prompt += f"\nPrevious discussion: {context[:200]}"
            llm.set_input({"prompt": prompt[:300]})
            response = skeptic_llm.generate(topic)
            llm.set_output({"response": response[:200]})

        result = {
            "speaker": "🔍 Skeptic",
            "response": response,
            "round": round_num,
            "evidence": evidence,
        }
        tracker.set_output({"response_length": len(response), "round": round_num})
        return result


def pragmatist_agent(topic: str, round_num: int, context: str) -> dict:
    """Pragmatist expert — finds middle ground and practical solutions."""
    with agentq.track_agent("pragmatist-agent") as tracker:
        tracker.set_input({
            "topic": topic[:100],
            "round": round_num,
            "context_length": len(context),
        })

        # Tool: analyze both sides
        with agentq.track_tool("analyze-perspectives") as tool:
            tool.set_input({"topic": topic[:100], "focus": "balanced"})
            time.sleep(random.uniform(0.05, 0.1))
            analysis = {
                "sources_found": random.randint(3, 7),
                "sentiment": "balanced",
                "confidence": round(random.uniform(0.80, 0.95), 2),
            }
            tool.set_output(analysis)

        # LLM: generate pragmatic perspective
        with agentq.track_llm("generate-pragmatist-view", model="mock-pragmatist") as llm:
            prompt = f"Round {round_num}: Give a practical take on: {topic}"
            if context:
                prompt += f"\nPrevious discussion: {context[:200]}"
            llm.set_input({"prompt": prompt[:300]})
            response = pragmatist_llm.generate(topic)
            llm.set_output({"response": response[:200]})

        result = {
            "speaker": "⚖️ Pragmatist",
            "response": response,
            "round": round_num,
            "evidence": analysis,
        }
        tracker.set_output({"response_length": len(response), "round": round_num})
        return result


def moderator_agent(topic: str, debate_rounds: list[list[dict]]) -> dict:
    """Moderator — synthesizes all perspectives into a balanced conclusion."""
    with agentq.track_agent("moderator-agent") as tracker:
        tracker.set_input({
            "topic": topic[:100],
            "total_rounds": len(debate_rounds),
            "total_contributions": sum(len(r) for r in debate_rounds),
        })

        # Tool: tally the debate contributions
        with agentq.track_tool("tally-debate") as tool:
            tool.set_input({
                "rounds": len(debate_rounds),
                "speakers": ["Optimist", "Skeptic", "Pragmatist"],
            })
            time.sleep(random.uniform(0.05, 0.1))
            tally = {
                "total_arguments": sum(len(r) for r in debate_rounds),
                "consensus_areas": random.randint(1, 3),
                "disagreement_areas": random.randint(1, 2),
            }
            tool.set_output(tally)

        # LLM: synthesize conclusion
        with agentq.track_llm("synthesize-conclusion", model="mock-moderator") as llm:
            llm.set_input({
                "topic": topic[:100],
                "tally": tally,
                "round_count": len(debate_rounds),
            })
            synthesis = moderator_llm.generate(topic)
            llm.set_output({"synthesis": synthesis[:200]})

        result = {
            "speaker": "🏛️ Moderator",
            "synthesis": synthesis,
            "tally": tally,
        }
        tracker.set_output({
            "synthesis_length": len(synthesis),
            "total_contributions": tally["total_arguments"],
        })
        return result


def run_debate(topic: str, session_id: str) -> dict:
    """Run a full multi-round debate on the given topic.

    The debate proceeds in rounds:
    1. Each round: Optimist → Skeptic → Pragmatist share perspectives
    2. After all rounds: Moderator synthesizes a balanced conclusion

    All agent interactions are traced in AgentQ, showing the multi-round
    collaborative pattern.
    """
    with agentq.session(session_id=session_id, name="debate-arena"):
        with agentq.track_agent("debate-orchestrator") as tracker:
            tracker.set_input({"topic": topic, "rounds": NUM_ROUNDS})

            debate_rounds: list[list[dict]] = []
            context = ""

            # Run debate rounds
            for round_num in range(1, NUM_ROUNDS + 1):
                round_contributions = []

                # Each expert contributes in this round
                optimist_result = optimist_agent(topic, round_num, context)
                round_contributions.append(optimist_result)
                context += f"\nOptimist (R{round_num}): {optimist_result['response'][:100]}"

                skeptic_result = skeptic_agent(topic, round_num, context)
                round_contributions.append(skeptic_result)
                context += f"\nSkeptic (R{round_num}): {skeptic_result['response'][:100]}"

                pragmatist_result = pragmatist_agent(topic, round_num, context)
                round_contributions.append(pragmatist_result)
                context += f"\nPragmatist (R{round_num}): {pragmatist_result['response'][:100]}"

                debate_rounds.append(round_contributions)

            # Moderator synthesizes
            moderator_result = moderator_agent(topic, debate_rounds)

            result = {
                "rounds": debate_rounds,
                "moderator": moderator_result,
                "topic": topic,
            }
            tracker.set_output({
                "total_rounds": len(debate_rounds),
                "total_contributions": sum(len(r) for r in debate_rounds),
            })
            return result


# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------

st.title("🏛️ Debate Arena")
st.caption(
    "Pose a topic — expert agents (Optimist, Skeptic, Pragmatist) debate it "
    "in rounds, then a Moderator synthesizes the conclusion. Watch the "
    "collaborative traces in AgentQ!"
)

# Sidebar
with st.sidebar:
    st.header("ℹ️ About")
    st.markdown(
        "This app demonstrates the **Collaborative / Discussion** pattern:\n\n"
        f"1. 🌟 **Optimist**, 🔍 **Skeptic**, ⚖️ **Pragmatist** debate "
        f"in **{NUM_ROUNDS} rounds**\n"
        "2. Each agent considers the others' prior arguments\n"
        "3. 🏛️ **Moderator** synthesizes a balanced conclusion\n\n"
        "Each contribution appears as an agent span in AgentQ, showing "
        "the multi-round collaborative trace."
    )
    st.divider()
    st.markdown(
        f"**AgentQ Dashboard:** [{st.session_state.agentq_endpoint}]"
        f"({st.session_state.agentq_endpoint})"
    )
    st.divider()
    st.subheader("💡 Try these topics:")
    st.markdown(
        "- *Will AI replace most jobs?*\n"
        "- *Is remote work better than office work?*\n"
        "- *Is cryptocurrency the future of finance?*\n"
        "- *Can we solve climate change with technology?*"
    )

# Initialize chat history and session ID
if "messages" not in st.session_state:
    st.session_state.messages = []
if "session_id" not in st.session_state:
    st.session_state.session_id = f"debate-{uuid.uuid4().hex[:8]}"

# Display chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        if msg["role"] == "user":
            st.markdown(msg["content"])
        elif msg["role"] == "assistant":
            st.markdown(msg["content"])
            if "rounds" in msg:
                with st.expander("🏛️ Show full debate transcript"):
                    for i, round_entries in enumerate(msg["rounds"], 1):
                        st.markdown(f"### Round {i}")
                        for entry in round_entries:
                            st.markdown(f"**{entry['speaker']}:**")
                            st.markdown(entry["response"])
                            st.divider()
                    if "moderator" in msg:
                        st.markdown("### Moderator's Conclusion")
                        tally = msg["moderator"]["tally"]
                        st.info(
                            f"📊 Arguments heard: {tally['total_arguments']} | "
                            f"Consensus areas: {tally['consensus_areas']} | "
                            f"Disagreements: {tally['disagreement_areas']}"
                        )

# Chat input
if user_input := st.chat_input("Pose a debate topic..."):
    # Display user message
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)

    # Run the debate
    with st.chat_message("assistant"):
        with st.spinner(f"🏛️ Debating in {NUM_ROUNDS} rounds..."):
            result = run_debate(user_input, st.session_state.session_id)

        # Display the moderator's synthesis as the main response
        st.markdown(result["moderator"]["synthesis"])

        # Show the full debate in an expander
        with st.expander("🏛️ Show full debate transcript"):
            for i, round_entries in enumerate(result["rounds"], 1):
                st.markdown(f"### Round {i}")
                for entry in round_entries:
                    st.markdown(f"**{entry['speaker']}:**")
                    st.markdown(entry["response"])
                    st.divider()
            st.markdown("### Moderator's Conclusion")
            tally = result["moderator"]["tally"]
            st.info(
                f"📊 Arguments heard: {tally['total_arguments']} | "
                f"Consensus areas: {tally['consensus_areas']} | "
                f"Disagreements: {tally['disagreement_areas']}"
            )

    # Save to history
    st.session_state.messages.append({
        "role": "assistant",
        "content": result["moderator"]["synthesis"],
        "rounds": [
            [{"speaker": c["speaker"], "response": c["response"]} for c in r]
            for r in result["rounds"]
        ],
        "moderator": {
            "synthesis": result["moderator"]["synthesis"],
            "tally": result["moderator"]["tally"],
        },
    })
