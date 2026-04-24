"""
Debate Arena — Collaborative Multi-Round Pattern
==================================================

Multiple expert agents (Optimist, Skeptic, Pragmatist) debate a user's topic
across multiple rounds with context accumulation, then a Moderator agent
synthesizes a balanced conclusion.

Demonstrates collaborative multi-agent trace topology — each round's agents
receive and build upon the accumulated context from prior rounds, producing
distinct responses that show real multi-round discourse in AgentQ traces.

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
# Round-aware Mock LLM helper
# ---------------------------------------------------------------------------

class RoundAwareMockLLM:
    """A mock LLM that returns different responses per round.

    Round 1 delivers an opening position. Round 2 delivers a rebuttal that
    references the other speakers' arguments, demonstrating context
    accumulation across debate rounds.

    Args:
        round_llms: Dict mapping round number → MockLLM instance.
        fallback_llm: Used when the round number has no dedicated LLM.
    """

    def __init__(
        self,
        round_llms: dict[int, MockLLM],
        fallback_llm: MockLLM | None = None,
    ):
        self._round_llms = round_llms
        self._fallback = fallback_llm or round_llms.get(1, MockLLM())

    def generate(self, prompt: str, round_num: int = 1) -> str:
        llm = self._round_llms.get(round_num, self._fallback)
        return llm.generate(prompt)


# ---------------------------------------------------------------------------
# Mock LLM setup — Round 1 (opening positions) and Round 2 (rebuttals)
# ---------------------------------------------------------------------------

# ── Optimist ──────────────────────────────────────────────────────────────

_optimist_r1 = MockLLM(
    default_response=(
        "I see tremendous potential here! Every challenge is an opportunity "
        "in disguise. The key is to focus on the possibilities rather than "
        "the limitations. History shows that bold ideas — even controversial "
        "ones — often lead to breakthrough innovations."
    )
)
_optimist_r1.add_response(
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
_optimist_r1.add_response(
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
_optimist_r1.add_response(
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
_optimist_r1.add_response(
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

# Optimist Round 2 — rebuttals that reference the Skeptic's Round 1 points
_optimist_r2 = MockLLM(
    default_response=(
        "After hearing the counter-arguments, I'm even *more* confident in "
        "the upside. The Skeptic raises valid caution, but caution alone "
        "never changed the world. Every transformative technology faced "
        "identical fears — and yet humanity adapted and thrived. Let's channel "
        "the concern into safeguards, not paralysis."
    )
)
_optimist_r2.add_response(
    ["ai", "artificial intelligence", "machine learning", "automation"],
    "I hear the Skeptic's concerns, but let me push back with evidence: 💪\n\n"
    "**On job displacement:** The ATM was supposed to eliminate bank tellers — "
    "instead, teller jobs *grew* because banks could open more branches cheaply. "
    "AI will follow the same pattern: automating tasks, not entire roles.\n\n"
    "**On bias:** Yes, AI can be biased — but so are humans! The difference is "
    "we can *audit* and *fix* algorithmic bias systematically. Try doing that "
    "with unconscious human bias.\n\n"
    "**On power concentration:** Open-source AI (LLaMA, Mistral, Stable Diffusion) "
    "is democratizing access faster than any previous technology.\n\n"
    "The Pragmatist's 'augment, don't replace' framing is right — and that's "
    "exactly what's happening. Let's invest in the future, not fear it.",
    priority=10,
)
_optimist_r2.add_response(
    ["remote work", "work from home", "wfh", "hybrid", "office"],
    "The Skeptic's concerns deserve a response, but the data tells a clear story: 📊\n\n"
    "**On isolation:** Remote work doesn't *cause* isolation — poor management does. "
    "Companies with intentional virtual culture (GitLab, Automattic) report higher "
    "employee satisfaction than most office-based firms.\n\n"
    "**On career penalties:** This is a *management problem*, not a remote work problem. "
    "The fix is better promotion criteria, not forcing everyone back to offices.\n\n"
    "**On collaboration:** Slack, Figma, and Zoom have enabled distributed teams to "
    "ship products that rival anything built in an office. Linux, Wikipedia, and "
    "most open-source software were built by distributed contributors.\n\n"
    "The genie is out of the bottle. Workers have tasted flexibility, and "
    "companies that deny it will lose their best talent.",
    priority=10,
)
_optimist_r2.add_response(
    ["crypto", "blockchain", "bitcoin", "web3", "decentralized"],
    "I appreciate the Skeptic's caution, but let's separate signal from noise: 🔎\n\n"
    "**On speculation:** Early internet stocks were wildly speculative too — the "
    "dot-com bust didn't invalidate the internet. The same winnowing is happening "
    "in crypto.\n\n"
    "**On scams:** Fraud exists in every financial system. The SEC didn't prevent "
    "Enron or Bernie Madoff. The answer is regulation, not rejection.\n\n"
    "**On adoption:** Stablecoins processed $11 trillion in 2024 — more than Visa. "
    "That's not negligible. Cross-border remittances on blockchain are already "
    "cheaper and faster than Western Union.\n\n"
    "The Pragmatist is right to focus on use cases. Real utility is growing "
    "quietly while critics focus on the spectacle.",
    priority=10,
)
_optimist_r2.add_response(
    ["climate", "environment", "green", "sustainable", "energy", "solar", "renewable"],
    "The Skeptic raises real challenges, but the trajectory matters more: 📈\n\n"
    "**On mineral dependence:** Battery recycling is scaling rapidly, and new "
    "chemistries (sodium-ion, iron-air) are reducing rare-earth dependency. This "
    "is a solvable engineering problem, not a fundamental barrier.\n\n"
    "**On grid reliability:** Texas's grid failures were caused by *fossil fuel* "
    "plant failures, not renewables. Modern grid storage (4-hour batteries) is "
    "solving intermittency.\n\n"
    "**On cost burden:** Solar is already the *cheapest* energy source. The "
    "transition *saves* low-income households money on energy bills.\n\n"
    "The Pragmatist is right that we need just-transition policies. But the "
    "economic case for green energy is now overwhelming — the market is "
    "doing the work even without perfect policy.",
    priority=10,
)

optimist_llm = RoundAwareMockLLM({1: _optimist_r1, 2: _optimist_r2})

# ── Skeptic ───────────────────────────────────────────────────────────────

_skeptic_r1 = MockLLM(
    default_response=(
        "Let's pump the brakes and think critically about this. Every "
        "exciting narrative has hidden downsides that advocates prefer to "
        "ignore. Before we rush forward, we need to ask the hard questions "
        "about who benefits, who bears the risk, and what could go wrong."
    )
)
_skeptic_r1.add_response(
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
_skeptic_r1.add_response(
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
_skeptic_r1.add_response(
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
_skeptic_r1.add_response(
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

# Skeptic Round 2 — rebuttals that respond to the Optimist's Round 1 points
_skeptic_r2 = MockLLM(
    default_response=(
        "The Optimist's enthusiasm is charming but dangerously naive. "
        "Pointing to *potential* benefits doesn't address *existing* harms. "
        "The Pragmatist offers sensible guardrails, but I worry even those "
        "underestimate the scale of the problem. We need stronger safeguards "
        "than 'measured optimism' provides."
    )
)
_skeptic_r2.add_response(
    ["ai", "artificial intelligence", "machine learning", "automation"],
    "The Optimist's ATM analogy is misleading — here's why: 🔬\n\n"
    "**On 'new jobs':** ATMs automated a *single task*. AI automates *cognition* — "
    "writing, coding, analysis, design. That's a categorically different threat. "
    "The new jobs being created require skills most displaced workers don't have.\n\n"
    "**On auditing bias:** In theory, yes. In practice, companies resist transparency. "
    "Amazon scrapped its AI recruiting tool after discovering gender bias — *after years "
    "of using it.* The audit-and-fix cycle is too slow for the harm being done.\n\n"
    "**On open source:** Open-source AI is a double-edged sword. It also means "
    "bad actors have access to powerful tools for deepfakes, disinformation, "
    "and autonomous weapons.\n\n"
    "I appreciate the Pragmatist's call for regulation, but regulation "
    "consistently lags technology. By the time we 'shape the transformation,' "
    "the damage may already be done.",
    priority=10,
)
_skeptic_r2.add_response(
    ["remote work", "work from home", "wfh", "hybrid", "office"],
    "The Optimist cites outlier companies — let me give the broader picture: 📋\n\n"
    "**On GitLab and Automattic:** These are *tech companies built remote-first.* "
    "Most organizations can't replicate their culture. A hospital, a factory, "
    "a school — these need physical presence.\n\n"
    "**On the management argument:** Blaming managers for isolation is like blaming "
    "the thermostat for winter. Physical proximity provides social cues, spontaneous "
    "mentorship, and belonging that no Zoom call replicates.\n\n"
    "**On open source:** Linux was built by *highly self-motivated experts*, not "
    "typical corporate teams. Most teams need the accountability and rhythm "
    "that co-location provides.\n\n"
    "I'll concede the Pragmatist's hybrid model has merit — but 'hybrid' often "
    "means the worst of both worlds: empty offices on Mondays and Fridays, "
    "and Zoom fatigue the rest of the week.",
    priority=10,
)
_skeptic_r2.add_response(
    ["crypto", "blockchain", "bitcoin", "web3", "decentralized"],
    "The Optimist's internet comparison doesn't hold up: 🧐\n\n"
    "**On the dot-com analogy:** The internet had clear utility from day one — "
    "email, web pages, search. After 15 years, crypto's killer app is still "
    "'number go up.' That's not the same trajectory.\n\n"
    "**On stablecoin volume:** Most stablecoin volume is wash trading and "
    "DeFi loops, not real economic activity. Actual merchant crypto payments "
    "have *declined* since 2021.\n\n"
    "**On remittances:** The Pragmatist correctly identifies this as a real "
    "use case, but traditional fintech (Wise, Remitly) is solving the same "
    "problem faster, cheaper, and without the volatility risk.\n\n"
    "I don't deny blockchain *technology* has niche applications. But the "
    "ecosystem built around it is overwhelmingly speculative, and the "
    "evangelists have a massive financial incentive to keep the hype alive.",
    priority=10,
)
_skeptic_r2.add_response(
    ["climate", "environment", "green", "sustainable", "energy", "solar", "renewable"],
    "The Optimist's trajectory argument has a fatal flaw — timing: ⏰\n\n"
    "**On battery recycling:** Promising, but still at <5% of batteries produced. "
    "Scaling recycling to match EV growth will take decades we don't have.\n\n"
    "**On Texas:** The *entire grid* failed because it was designed for cheap "
    "fossil fuels. That's my point — the infrastructure overhaul is massive "
    "and nobody wants to pay for it.\n\n"
    "**On solar being cheapest:** Only when the sun shines. Levelized cost "
    "comparisons ignore the system costs of storage, transmission, and backup "
    "generation that intermittent sources require.\n\n"
    "I agree with the Pragmatist that nuclear must be part of the conversation. "
    "But the same activists pushing renewables have blocked nuclear for decades. "
    "The green movement's own contradictions are slowing the transition.",
    priority=10,
)

skeptic_llm = RoundAwareMockLLM({1: _skeptic_r1, 2: _skeptic_r2})

# ── Pragmatist ────────────────────────────────────────────────────────────

_pragmatist_r1 = MockLLM(
    default_response=(
        "Both sides make valid points. The truth, as usual, lies somewhere "
        "in the middle. Rather than debating extremes, let's focus on what "
        "practical steps we can take today that account for both the "
        "opportunities and the risks."
    )
)
_pragmatist_r1.add_response(
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
_pragmatist_r1.add_response(
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
_pragmatist_r1.add_response(
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
_pragmatist_r1.add_response(
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

# Pragmatist Round 2 — draws conclusions after hearing both sides' rebuttals
_pragmatist_r2 = MockLLM(
    default_response=(
        "This debate has sharpened the real trade-offs nicely. The Optimist "
        "and Skeptic are both right — but about different things. My updated "
        "recommendation: proceed with the opportunity, invest heavily in the "
        "safeguards the Skeptic demands, and measure progress honestly rather "
        "than through either rosy or gloomy lenses."
    )
)
_pragmatist_r2.add_response(
    ["ai", "artificial intelligence", "machine learning", "automation"],
    "This round clarified the real crux of the AI debate: ⚖️\n\n"
    "The Optimist's ATM analogy and the Skeptic's 'cognition is different' "
    "rebuttal reveal the core tension: **we don't know the speed of displacement "
    "vs. creation.** That uncertainty demands a specific policy response:\n\n"
    "**Actionable framework:**\n"
    "1. **Sector-by-sector impact assessments** — not blanket optimism or pessimism\n"
    "2. **Portable benefits** — decouple healthcare and retirement from employers "
    "so workers can transition between roles\n"
    "3. **AI transparency requirements** — the Skeptic is right that voluntary "
    "auditing isn't working; make it mandatory\n"
    "4. **Public AI infrastructure** — fund open alternatives to prevent the "
    "concentration of power both sides acknowledge\n\n"
    "Neither 'full speed ahead' nor 'pump the brakes' is sufficient. We need "
    "adaptive governance that moves as fast as the technology.",
    priority=10,
)
_pragmatist_r2.add_response(
    ["remote work", "work from home", "wfh", "hybrid", "office"],
    "Both rounds have clarified where the real problems lie: ⚖️\n\n"
    "The Optimist blames management, the Skeptic blames remote work itself — "
    "the truth is that **most organizations haven't invested in making either "
    "model work well.** Here's what the evidence actually supports:\n\n"
    "**Concrete recommendations:**\n"
    "1. **Structured hybrid** — not 'come in whenever', but designated "
    "collaboration days (the Skeptic's 'worst of both worlds' critique "
    "targets *unstructured* hybrid)\n"
    "2. **Outcome metrics** — both sides agree measuring hours is broken; "
    "invest in results-based evaluation systems\n"
    "3. **Equity audits** — track promotion rates by work location and fix "
    "disparities the Skeptic correctly flags\n"
    "4. **Loneliness intervention** — the mental health signal is real; "
    "build social infrastructure, don't just hope it emerges\n\n"
    "The future isn't one-size-fits-all. The best companies will offer "
    "options and *manage* them intentionally.",
    priority=10,
)
_pragmatist_r2.add_response(
    ["crypto", "blockchain", "bitcoin", "web3", "decentralized"],
    "The Skeptic's rebuttal on the internet analogy was particularly sharp. "
    "Let me refine my position: ⚖️\n\n"
    "The Skeptic is right that crypto's trajectory looks different from the "
    "internet's — but the Optimist's point about stablecoins and remittances "
    "is also substantive. Here's my updated take:\n\n"
    "**What should survive:**\n"
    "1. **Stablecoin payments** — even discounting wash trading, the cross-border "
    "payment use case is real and growing\n"
    "2. **Tokenized assets** — securities settlement on blockchain is being adopted "
    "by BlackRock and JPMorgan, not just crypto-native firms\n"
    "3. **Digital identity** — self-sovereign credentials are quietly solving real "
    "problems in developing countries\n\n"
    "**What should die:**\n"
    "- Meme coins, yield farming ponzis, and the 'decentralization theater' "
    "the Skeptic correctly calls out\n\n"
    "The industry needs to stop defending everything with a token "
    "and start highlighting what actually works.",
    priority=10,
)
_pragmatist_r2.add_response(
    ["climate", "environment", "green", "sustainable", "energy", "solar", "renewable"],
    "Both sides refined their positions well. Here's my synthesis: ⚖️\n\n"
    "The Optimist's cost curves are real — solar *is* cheapest. The Skeptic's "
    "system cost argument is *also* real — you can't just compare panel prices. "
    "Both can be true simultaneously.\n\n"
    "**What I'd recommend to a policymaker today:**\n"
    "1. **Deploy renewables + storage aggressively** — the economics justify it "
    "even accounting for system costs\n"
    "2. **Fast-track nuclear permitting** — the Skeptic's point about green "
    "movement contradictions is fair; baseload needs a solution\n"
    "3. **Just-transition bonds** — fund worker retraining and community "
    "investment specifically in fossil-fuel-dependent regions\n"
    "4. **Honest timelines** — stop promising net zero by 2030; set achievable "
    "interim targets and report progress transparently\n\n"
    "The climate fight is winnable, but only if we stop arguing about whether "
    "to act and start arguing about *how* to act most effectively.",
    priority=10,
)

pragmatist_llm = RoundAwareMockLLM({1: _pragmatist_r1, 2: _pragmatist_r2})

# ── Moderator ─────────────────────────────────────────────────────────────

moderator_llm = MockLLM(
    default_response=(
        "## 🏛️ Moderator's Synthesis\n\n"
        "After two rounds of debate, here's a balanced take:\n\n"
        "The Optimist highlights genuine potential that shouldn't be dismissed. "
        "The Skeptic raises valid concerns that need addressing. The Pragmatist "
        "offers a realistic path forward — one strengthened by the specific "
        "counter-arguments exchanged in Round 2.\n\n"
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
    "Two rounds of debate crystallized three important truths:\n\n"
    "1. **AI's potential is real** — The Optimist is right that AI is already "
    "saving lives in healthcare and accelerating scientific discovery. The "
    "Round 2 evidence on open-source democratization is compelling.\n\n"
    "2. **The risks are equally real** — The Skeptic's Round 2 rebuttal was "
    "sharp: automating *cognition* is categorically different from automating "
    "physical tasks. The displacement timeline is genuinely uncertain.\n\n"
    "3. **Adaptive governance is the answer** — The Pragmatist's Round 2 "
    "framework — sector-specific assessments, portable benefits, mandatory "
    "transparency — is the most actionable path forward.\n\n"
    "**Verdict:** AI development should continue, but with mandatory safety "
    "research, bias audits, worker transition programs, and democratic "
    "governance. The goal is AI that benefits everyone, not just those "
    "building it.",
    priority=10,
)
moderator_llm.add_response(
    ["remote work", "work from home", "wfh", "hybrid", "office"],
    "## 🏛️ Moderator's Synthesis: The Remote Work Debate\n\n"
    "Two rounds revealed a clear consensus direction:\n\n"
    "1. **Flexibility is here to stay** — The Optimist's evidence on "
    "talent access and inclusion is compelling. The Round 2 point about "
    "companies losing talent for rigid policies hits home.\n\n"
    "2. **Connection still matters** — The Skeptic's Round 2 observation "
    "that outlier tech companies aren't representative is fair. Most "
    "organizations need more deliberate approaches.\n\n"
    "3. **Structured hybrid wins** — The Pragmatist's refined recommendation "
    "of *structured* hybrid (not ad-hoc) with equity audits addresses both "
    "sides' strongest arguments.\n\n"
    "**Verdict:** The future of work is structured hybrid, with intentional "
    "in-person time for collaboration, equity audits for remote workers, "
    "and investment in social infrastructure. One-size-fits-all is dead.",
    priority=10,
)
moderator_llm.add_response(
    ["crypto", "blockchain", "bitcoin", "web3", "decentralized"],
    "## 🏛️ Moderator's Synthesis: The Crypto Debate\n\n"
    "This was the most polarized debate, but Round 2 produced real clarity:\n\n"
    "1. **The internet analogy is strained** — The Skeptic's Round 2 point "
    "that the internet had clear utility from day one, while crypto's "
    "primary use remains speculation, was the strongest argument.\n\n"
    "2. **Real utility exists in niches** — The Optimist's stablecoin data "
    "and the Pragmatist's refined focus on payments, tokenized assets, and "
    "digital identity point to genuine value.\n\n"
    "3. **The industry must self-select** — The Pragmatist's Round 2 call "
    "for the industry to stop defending everything with a token is the "
    "key insight.\n\n"
    "**Verdict:** Support blockchain for verified, high-value use cases. "
    "Apply strict consumer protection to speculative assets. Judge projects "
    "by utility delivered, not tokens traded.",
    priority=10,
)
moderator_llm.add_response(
    ["climate", "environment", "green", "sustainable", "energy", "solar", "renewable"],
    "## 🏛️ Moderator's Synthesis: The Climate Debate\n\n"
    "This debate showed more agreement than disagreement across rounds:\n\n"
    "1. **The transition is inevitable** — Even the Skeptic's Round 2 "
    "arguments are about *how*, not *whether*, to transition.\n\n"
    "2. **System costs matter** — The Skeptic's distinction between panel "
    "costs and system costs was the most important technical point. Both "
    "the Optimist and Pragmatist acknowledged it in Round 2.\n\n"
    "3. **Nuclear + renewables + storage** — All three debaters converged "
    "on this combination by Round 2. That's a remarkable consensus.\n\n"
    "**Verdict:** Accelerate the green transition with a realistic energy "
    "mix (renewables + nuclear + storage), honest timelines, and "
    "just-transition policies. The cost of inaction far exceeds the cost "
    "of transition.",
    priority=10,
)


# ---------------------------------------------------------------------------
# Speaker definitions
# ---------------------------------------------------------------------------

SPEAKERS = [
    {"name": "optimist", "label": "🌟 Optimist", "llm": optimist_llm},
    {"name": "skeptic", "label": "🔍 Skeptic", "llm": skeptic_llm},
    {"name": "pragmatist", "label": "⚖️ Pragmatist", "llm": pragmatist_llm},
]

NUM_ROUNDS = 2  # Number of debate rounds


# ---------------------------------------------------------------------------
# Agent functions — each produces spans in AgentQ
# ---------------------------------------------------------------------------

def speaker_agent(
    speaker: dict,
    topic: str,
    round_num: int,
    context: str,
) -> dict:
    """Run a single speaker's contribution for one debate round.

    Args:
        speaker: Speaker config with name, label, and llm.
        topic: The debate topic.
        round_num: Current round (1-indexed).
        context: Accumulated transcript from prior contributions.

    Returns:
        Dict with speaker label, response text, round, and evidence.
    """
    agent_name = f"{speaker['name']}-agent"
    tool_name = f"research-{speaker['name']}-evidence"
    llm_name = f"generate-{speaker['name']}-view"

    with agentq.track_agent(agent_name) as tracker:
        tracker.set_input({
            "topic": topic[:100],
            "round": round_num,
            "context_length": len(context),
            "context_preview": context[-200:] if context else "(none)",
        })

        # Tool: research evidence for this speaker's perspective
        with agentq.track_tool(tool_name) as tool:
            tool.set_input({
                "topic": topic[:100],
                "round": round_num,
                "focus": speaker["name"],
            })
            time.sleep(random.uniform(0.05, 0.1))
            evidence = {
                "sources_found": random.randint(3, 7),
                "sentiment": speaker["name"],
                "confidence": round(random.uniform(0.75, 0.95), 2),
                "round": round_num,
            }
            tool.set_output(evidence)

        # LLM: generate this speaker's perspective
        model_name = f"mock-{speaker['name']}"
        with agentq.track_llm(llm_name, model=model_name) as llm:
            # Build prompt — for round 2+, include accumulated context
            prompt = f"Round {round_num}: topic={topic}"
            if round_num > 1 and context:
                prompt += f"\nPrevious round context:\n{context[:500]}"
            llm.set_input({"prompt": prompt[:500], "round": round_num})
            response = speaker["llm"].generate(topic, round_num=round_num)
            llm.set_output({"response": response[:300], "round": round_num})

        result = {
            "speaker": speaker["label"],
            "response": response,
            "round": round_num,
            "evidence": evidence,
        }
        tracker.set_output({
            "response_length": len(response),
            "round": round_num,
            "speaker": speaker["label"],
        })
        return result


def moderator_agent(topic: str, debate_rounds: list[list[dict]]) -> dict:
    """Moderator — synthesizes all perspectives into a balanced conclusion.

    Reviews all rounds, tallies contributions, and produces a final synthesis
    that references specific arguments from both rounds.
    """
    with agentq.track_agent("moderator-agent") as tracker:
        total_contributions = sum(len(r) for r in debate_rounds)
        tracker.set_input({
            "topic": topic[:100],
            "total_rounds": len(debate_rounds),
            "total_contributions": total_contributions,
        })

        # Tool: tally debate contributions
        with agentq.track_tool("tally-debate") as tool:
            # Build a summary of what each speaker argued per round
            argument_summary = {}
            for i, round_entries in enumerate(debate_rounds, 1):
                for entry in round_entries:
                    key = f"{entry['speaker']} R{i}"
                    argument_summary[key] = entry["response"][:80]
            tool.set_input({
                "rounds": len(debate_rounds),
                "speakers": [s["label"] for s in SPEAKERS],
                "argument_summary": argument_summary,
            })
            time.sleep(random.uniform(0.05, 0.1))
            tally = {
                "total_arguments": total_contributions,
                "consensus_areas": random.randint(2, 4),
                "disagreement_areas": random.randint(1, 3),
                "rounds_analyzed": len(debate_rounds),
            }
            tool.set_output(tally)

        # LLM: synthesize conclusion
        with agentq.track_llm("synthesize-conclusion", model="mock-moderator") as llm:
            # Include context from all rounds for trace visibility
            round_summaries = []
            for i, round_entries in enumerate(debate_rounds, 1):
                for entry in round_entries:
                    round_summaries.append(
                        f"R{i} {entry['speaker']}: {entry['response'][:100]}"
                    )
            llm.set_input({
                "topic": topic[:100],
                "tally": tally,
                "round_count": len(debate_rounds),
                "debate_context": "\n".join(round_summaries)[:800],
            })
            synthesis = moderator_llm.generate(topic)
            llm.set_output({"synthesis": synthesis[:300]})

        result = {
            "speaker": "🏛️ Moderator",
            "synthesis": synthesis,
            "tally": tally,
        }
        tracker.set_output({
            "synthesis_length": len(synthesis),
            "total_contributions": tally["total_arguments"],
            "consensus_areas": tally["consensus_areas"],
        })
        return result


def run_debate(topic: str, session_id: str) -> dict:
    """Run a full multi-round debate on the given topic.

    The debate proceeds in rounds with context accumulation:
    1. Each round: all speakers contribute, receiving the accumulated
       transcript from prior contributions as context
    2. Round 2 speakers explicitly respond to Round 1 arguments
    3. After all rounds: Moderator synthesizes a balanced conclusion

    All agent interactions are traced in AgentQ, showing the multi-round
    collaborative pattern with context passing between rounds.
    """
    with agentq.session(session_id=session_id, name="debate-arena"):
        with agentq.track_agent("debate-orchestrator") as tracker:
            tracker.set_input({"topic": topic, "rounds": NUM_ROUNDS})

            debate_rounds: list[list[dict]] = []
            context = ""  # Accumulated transcript for context passing

            # Run debate rounds
            for round_num in range(1, NUM_ROUNDS + 1):
                round_contributions = []

                for speaker in SPEAKERS:
                    result = speaker_agent(speaker, topic, round_num, context)
                    round_contributions.append(result)
                    # Accumulate context so the next speaker (and next round)
                    # can reference prior arguments
                    context += (
                        f"\n{speaker['label']} (Round {round_num}): "
                        f"{result['response'][:150]}"
                    )

                debate_rounds.append(round_contributions)

            # Moderator synthesizes all rounds
            moderator_result = moderator_agent(topic, debate_rounds)

            result = {
                "rounds": debate_rounds,
                "moderator": moderator_result,
                "topic": topic,
            }
            tracker.set_output({
                "total_rounds": len(debate_rounds),
                "total_contributions": sum(len(r) for r in debate_rounds),
                "context_length": len(context),
            })
            return result


# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------

st.title("🏛️ Debate Arena")
st.caption(
    "Pose a topic — expert agents (Optimist, Skeptic, Pragmatist) debate it "
    "across multiple rounds with context accumulation, then a Moderator "
    "synthesizes the conclusion. Watch the collaborative traces in AgentQ!"
)

# Sidebar
with st.sidebar:
    st.header("ℹ️ About")
    st.markdown(
        "This app demonstrates the **Collaborative Multi-Round** pattern:\n\n"
        f"1. 🌟 **Optimist**, 🔍 **Skeptic**, ⚖️ **Pragmatist** debate "
        f"in **{NUM_ROUNDS} rounds**\n"
        "2. Each agent receives the accumulated context from prior arguments\n"
        "3. **Round 2** speakers reference and rebut **Round 1** arguments\n"
        "4. 🏛️ **Moderator** synthesizes a balanced conclusion\n\n"
        "Each contribution appears as an agent span in AgentQ, showing "
        "the multi-round collaborative trace with context accumulation."
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
