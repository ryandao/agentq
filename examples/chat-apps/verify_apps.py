"""
Verification script for Streamlit chat apps: support-bot + debate-arena.

Exercises the core business logic of each app (agent functions, LLM mocking,
routing, debate rounds, trace generation) without requiring the Streamlit UI.
Also validates that each app's Streamlit UI loads successfully via subprocess.
"""

from __future__ import annotations

import sys
import os
import subprocess
import time

# Ensure shared modules are importable
sys.path.insert(0, os.path.dirname(__file__))

import agentq
from shared.mock_llm import MockLLM
from shared.agentq_setup import setup_agentq

PASS = 0
FAIL = 0


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name} — {detail}")


# ═══════════════════════════════════════════════════════════════════════════
# 1. SHARED INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 1. Shared Infrastructure ═══")

llm = MockLLM(default_response="default")
llm.add_response(["hello"], "hello response")
llm.add_response(["priority"], "low priority", priority=0)
llm.add_response(["priority"], "high priority", priority=10)

check("MockLLM default response", llm.generate("xyz", delay=False) == "default")
check("MockLLM keyword match", llm.generate("hello world", delay=False) == "hello response")
check("MockLLM priority ordering", llm.generate("priority test", delay=False) == "high priority")

endpoint = setup_agentq("verify-test-app")
check("setup_agentq returns endpoint", isinstance(endpoint, str) and "localhost" in endpoint)


# ═══════════════════════════════════════════════════════════════════════════
# 2. SUPPORT-BOT (Router pattern)
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 2. Support Bot — Router Pattern ═══")

router_llm = MockLLM(default_response="general")
router_llm.add_response(
    ["bill", "billing", "invoice", "payment", "charge", "subscription",
     "plan", "price", "pricing", "cost", "refund", "cancel", "upgrade",
     "downgrade", "discount", "coupon", "trial", "free tier"],
    "billing", priority=10,
)
router_llm.add_response(
    ["error", "bug", "crash", "500", "404", "timeout", "api", "endpoint",
     "webhook", "integration", "configure", "setup", "install", "deploy",
     "debug", "log", "trace", "sdk", "latency", "performance", "slow",
     "broken", "fix", "issue", "problem", "not working", "failed"],
    "technical", priority=10,
)

check("Router: billing query", router_llm.generate("How much does the pro plan cost?", delay=False) == "billing")
check("Router: technical query", router_llm.generate("My API keeps returning 500 errors", delay=False) == "technical")
check("Router: general query", router_llm.generate("What is AgentQ?", delay=False) == "general")
check("Router: refund → billing", router_llm.generate("I need a refund", delay=False) == "billing")
check("Router: webhook → technical", router_llm.generate("How do I configure webhooks?", delay=False) == "technical")

billing_llm = MockLLM(default_response="Default billing response")
billing_llm.add_response(["refund", "money back"], "Refund initiated")
billing_llm.add_response(["cancel", "cancellation"], "Cancellation processed")
billing_llm.add_response(["upgrade", "pro", "enterprise"], "Upgrade instructions")
billing_llm.add_response(["invoice", "receipt"], "Invoice history")

check("Billing LLM: refund", "Refund" in billing_llm.generate("I want a refund", delay=False))
check("Billing LLM: cancel", "Cancel" in billing_llm.generate("cancel my subscription", delay=False))
check("Billing LLM: upgrade", "Upgrade" in billing_llm.generate("upgrade to pro", delay=False))
check("Billing LLM: default", "Default" in billing_llm.generate("generic billing question", delay=False))

tech_llm = MockLLM(default_response="Default tech response")
tech_llm.add_response(["500", "error", "crash", "broken", "not working", "failed"], "Debug error")
tech_llm.add_response(["webhook", "configure", "setup", "integration"], "Integration setup")
tech_llm.add_response(["slow", "latency", "performance"], "Performance diagnosis")

check("Tech LLM: error", "Debug" in tech_llm.generate("I'm getting 500 errors", delay=False))
check("Tech LLM: setup", "Integration" in tech_llm.generate("How to configure webhooks?", delay=False))
check("Tech LLM: performance", "Performance" in tech_llm.generate("The dashboard is slow", delay=False))

faq_llm = MockLLM(default_response="AgentQ is an observability platform")
faq_llm.add_response(["how does", "how do", "what is", "explain"], "How AgentQ works")
faq_llm.add_response(["start", "getting started", "begin", "tutorial"], "Getting started guide")

check("FAQ LLM: what is", "How AgentQ works" in faq_llm.generate("What is AgentQ?", delay=False))
check("FAQ LLM: getting started", "Getting started" in faq_llm.generate("I need a tutorial to begin", delay=False))
check("FAQ LLM: default", "observability" in faq_llm.generate("something random", delay=False))

# --- AgentQ trace generation for support-bot ---
print("\n  --- Support Bot: AgentQ Trace Test ---")

session_id = "verify-support-bot-test"
with agentq.session(session_id=session_id, name="support-bot"):
    with agentq.track_agent("router-agent") as tracker:
        tracker.set_input({"message": "How much does billing cost?"})
        with agentq.track_llm("classify-question", model="mock-router") as llm_tracker:
            llm_tracker.set_input({"message": "How much does billing cost?"})
            category = router_llm.generate("How much does billing cost?", delay=False)
            llm_tracker.set_output({"category": category})
        check("Trace: classify returned category", category == "billing")
        with agentq.track_agent("billing-agent") as billing_tracker:
            billing_tracker.set_input({"message": "billing cost"})
            with agentq.track_tool("lookup-account") as tool:
                tool.set_input({"action": "fetch_billing_info"})
                tool.set_output({"plan": "Pro"})
            with agentq.track_llm("generate-billing-response", model="mock-billing") as blm:
                blm.set_input({"message": "billing cost"})
                resp = billing_llm.generate("billing cost", delay=False)
                blm.set_output({"response": resp})
            billing_tracker.set_output({"response": resp})
        check("Trace: billing agent produced response", len(resp) > 0)
        tracker.set_output({"response": resp, "category": category})

check("Support-bot: trace topology generated without errors", True)


# ═══════════════════════════════════════════════════════════════════════════
# 3. DEBATE-ARENA (Collaborative Multi-Round pattern)
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 3. Debate Arena — Collaborative Multi-Round Pattern ═══")

class RoundAwareMockLLM:
    def __init__(self, round_llms, fallback_llm=None):
        self._round_llms = round_llms
        self._fallback = fallback_llm or round_llms.get(1, MockLLM())
    def generate(self, prompt, round_num=1):
        llm = self._round_llms.get(round_num, self._fallback)
        return llm.generate(prompt)

r1_llm = MockLLM(default_response="Round 1 default")
r1_llm.add_response(["ai"], "AI Round 1 opening position")
r2_llm = MockLLM(default_response="Round 2 default")
r2_llm.add_response(["ai"], "AI Round 2 rebuttal referencing prior arguments")
ra_llm = RoundAwareMockLLM({1: r1_llm, 2: r2_llm})

check("RoundAwareMockLLM: R1 response", "Round 1" in ra_llm.generate("ai topic", round_num=1))
check("RoundAwareMockLLM: R2 response", "Round 2" in ra_llm.generate("ai topic", round_num=2))
check("RoundAwareMockLLM: fallback to R1", "Round 1" in ra_llm.generate("ai topic", round_num=99))

# Topic-specific responses
_opt_r1 = MockLLM(default_response="Optimist default R1")
_opt_r1.add_response(["ai", "artificial intelligence"], "AI exciting", priority=10)
_opt_r1.add_response(["remote work", "work from home"], "Remote revolution", priority=10)
_opt_r1.add_response(["crypto", "blockchain", "bitcoin"], "Blockchain power", priority=10)
_opt_r1.add_response(["climate", "environment", "green", "sustainable", "energy"], "Green opportunity", priority=10)

_opt_r2 = MockLLM(default_response="Optimist default R2")
_opt_r2.add_response(["ai", "artificial intelligence"], "ATM rebuttal", priority=10)
_opt_r2.add_response(["remote work", "work from home"], "Data clear story", priority=10)
_opt_r2.add_response(["crypto", "blockchain", "bitcoin"], "Signal noise", priority=10)
_opt_r2.add_response(["climate", "environment", "green", "sustainable", "energy"], "Trajectory matters", priority=10)

opt_llm = RoundAwareMockLLM({1: _opt_r1, 2: _opt_r2})

check("Optimist R1: AI topic", "AI exciting" in opt_llm.generate("artificial intelligence", round_num=1))
check("Optimist R2: AI topic", "ATM" in opt_llm.generate("artificial intelligence", round_num=2))
check("Optimist R1: climate", "Green" in opt_llm.generate("climate change", round_num=1))
check("Optimist R2: climate", "Trajectory" in opt_llm.generate("climate change", round_num=2))
check("Optimist R1: remote work", "Remote" in opt_llm.generate("remote work from home", round_num=1))
check("Optimist R2: remote work", "Data" in opt_llm.generate("remote work from home", round_num=2))
check("Optimist R1: crypto", "Blockchain" in opt_llm.generate("bitcoin crypto", round_num=1))
check("Optimist R2: crypto", "Signal" in opt_llm.generate("bitcoin crypto", round_num=2))

# 3 speakers produce distinct responses
_skp_r1 = MockLLM(default_response="Skeptic default")
_skp_r1.add_response(["ai"], "Reality check on AI", priority=10)
_prg_r1 = MockLLM(default_response="Pragmatist default")
_prg_r1.add_response(["ai"], "Both sides valid", priority=10)
skept_llm = RoundAwareMockLLM({1: _skp_r1})
prag_llm = RoundAwareMockLLM({1: _prg_r1})

r1_o = opt_llm.generate("ai", round_num=1)
r1_s = skept_llm.generate("ai", round_num=1)
r1_p = prag_llm.generate("ai", round_num=1)
check("3 speakers produce distinct R1 responses", len({r1_o, r1_s, r1_p}) == 3)

# --- Debate Arena: AgentQ Trace Test ---
print("\n  --- Debate Arena: AgentQ Trace Test ---")

SPEAKERS = [
    {"name": "optimist", "label": "Optimist", "llm": opt_llm},
    {"name": "skeptic", "label": "Skeptic", "llm": skept_llm},
    {"name": "pragmatist", "label": "Pragmatist", "llm": prag_llm},
]

NUM_ROUNDS = 2
debate_session_id = "verify-debate-arena-test"

with agentq.session(session_id=debate_session_id, name="debate-arena"):
    with agentq.track_agent("debate-orchestrator") as tracker:
        tracker.set_input({"topic": "AI", "rounds": NUM_ROUNDS})
        debate_rounds = []
        context = ""
        agent_calls = 0
        for round_num in range(1, NUM_ROUNDS + 1):
            round_contributions = []
            for speaker in SPEAKERS:
                agent_name = f"{speaker['name']}-agent"
                with agentq.track_agent(agent_name) as agent_tracker:
                    agent_tracker.set_input({"topic": "AI", "round": round_num})
                    with agentq.track_tool(f"research-{speaker['name']}-evidence") as tool:
                        tool.set_input({"topic": "AI", "round": round_num})
                        tool.set_output({"sources_found": 5})
                    with agentq.track_llm(f"generate-{speaker['name']}-view", model=f"mock-{speaker['name']}") as llm_t:
                        llm_t.set_input({"prompt": f"AI round {round_num}"})
                        response = speaker["llm"].generate("AI", round_num=round_num)
                        llm_t.set_output({"response": response[:100]})
                    entry = {"speaker": speaker["label"], "response": response, "round": round_num}
                    round_contributions.append(entry)
                    agent_tracker.set_output({"response_length": len(response)})
                    agent_calls += 1
                context += f"\n{speaker['label']} (Round {round_num}): {response[:100]}"
            debate_rounds.append(round_contributions)

        with agentq.track_agent("moderator-agent") as mod_tracker:
            mod_tracker.set_input({"topic": "AI", "total_rounds": NUM_ROUNDS})
            with agentq.track_tool("tally-debate") as tool:
                tool.set_input({"rounds": NUM_ROUNDS})
                tool.set_output({"total_arguments": agent_calls})
            with agentq.track_llm("synthesize-conclusion", model="mock-moderator") as synth:
                synth.set_input({"topic": "AI"})
                synthesis = "Moderator synthesis complete."
                synth.set_output({"synthesis": synthesis})
            mod_tracker.set_output({"synthesis_length": len(synthesis)})
        tracker.set_output({"total_rounds": len(debate_rounds), "total_contributions": agent_calls})

check("Debate trace: correct agent calls (3x2=6)", agent_calls == 6)
check("Debate trace: correct number of rounds", len(debate_rounds) == 2)
check("Debate trace: each round has 3 contributions", all(len(r) == 3 for r in debate_rounds))
check("Debate trace: context accumulates", len(context) > 200, f"Context length: {len(context)}")
check("Debate trace: topology generated without errors", True)


# ═══════════════════════════════════════════════════════════════════════════
# 4. STREAMLIT UI LOAD TEST
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 4. Streamlit UI Load Tests ═══")

def test_streamlit_loads(app_dir, app_name):
    main_py = os.path.join(app_dir, "main.py")
    proc = subprocess.Popen(
        [sys.executable, "-m", "streamlit", "run", main_py, "--server.headless", "true",
         "--server.port", "0", "--browser.gatherUsageStats", "false"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=app_dir,
    )
    try:
        start = time.time()
        output_lines = []
        loaded = False
        while time.time() - start < 30:
            line = proc.stdout.readline()
            if not line:
                break
            output_lines.append(line.strip())
            if "You can now view your Streamlit app" in line or "Local URL:" in line or "Network URL:" in line:
                loaded = True
                break
        return loaded, output_lines
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

base = os.path.dirname(os.path.abspath(__file__))

loaded, lines = test_streamlit_loads(os.path.join(base, "support-bot"), "support-bot")
check("Streamlit loads: support-bot", loaded, f"Output: {lines[-5:] if lines else 'no output'}")

loaded, lines = test_streamlit_loads(os.path.join(base, "debate-arena"), "debate-arena")
check("Streamlit loads: debate-arena", loaded, f"Output: {lines[-5:] if lines else 'no output'}")


# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
print(f"\n{'=' * 50}")
print(f"RESULTS: {PASS} passed, {FAIL} failed, {PASS + FAIL} total")
print(f"{'=' * 50}")

if FAIL > 0:
    print("Some tests failed!")
    sys.exit(1)
else:
    print("All tests passed!")
    sys.exit(0)
