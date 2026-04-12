/**
 * Basic usage example for the AgentQ TypeScript SDK.
 *
 * This example shows how to:
 * 1. Auto-detect installed frameworks
 * 2. Subscribe to agent lifecycle events
 * 3. Manually wrap agents
 */

import { AgentQ, autoIntegrate, Framework, type EventPayload } from "@agentq/sdk";

// ─────────────────────────────────────────────────
// Option 1: Quick start with auto-detect
// ─────────────────────────────────────────────────

const agentq = autoIntegrate({
  onEvent: (event: EventPayload) => {
    console.log(`[${event.event}] Agent: ${event.agentId} | Run: ${event.runId}`);
  },
  debug: true,
});

// ─────────────────────────────────────────────────
// Option 2: Manual configuration
// ─────────────────────────────────────────────────

const manual = new AgentQ({
  frameworks: [Framework.LANGCHAIN, Framework.CREWAI],
  autoPatch: false,
  debug: true,
});

manual.init();

// Only patch the frameworks you want
manual.patchFramework(Framework.LANGCHAIN);

// ─────────────────────────────────────────────────
// Wrapping agents manually
// ─────────────────────────────────────────────────

// Assuming you have a LangChain agent instance:
// import { AgentExecutor } from "langchain/agents";
// const langchainAgent = new AgentExecutor({ ... });

// Wrap it with AgentQ:
// const wrapped = agentq.wrap(langchainAgent, Framework.LANGCHAIN, "my-agent");
// The wrapped agent has the exact same API, but now emits lifecycle events.

// ─────────────────────────────────────────────────
// Subscribing to events
// ─────────────────────────────────────────────────

agentq.onEvent((event) => {
  switch (event.event) {
    case "agent_start":
      console.log(`Agent ${event.agentId} started run ${event.runId}`);
      break;
    case "agent_end":
      console.log(`Agent ${event.agentId} completed run ${event.runId}`);
      break;
    case "agent_error":
      console.error(`Agent ${event.agentId} errored:`, event.data.error);
      break;
  }
});

// ─────────────────────────────────────────────────
// Detection API
// ─────────────────────────────────────────────────

const detector = agentq.getDetector();
const results = detector.detectAll();

for (const result of results) {
  console.log(
    `${result.framework}: installed=${result.installed}, active=${result.active}` +
      (result.version ? `, version=${result.version}` : ""),
  );
}

// ─────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────

agentq.destroy();
manual.destroy();
