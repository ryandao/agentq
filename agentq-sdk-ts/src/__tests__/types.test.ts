import { describe, it, expect } from "vitest";
import { Framework, FRAMEWORKS, AgentEvent } from "../types.js";

describe("Framework", () => {
  it("should define all four supported frameworks", () => {
    expect(Framework.LANGCHAIN).toBe("langchain");
    expect(Framework.CREWAI).toBe("crewai");
    expect(Framework.AUTOGEN).toBe("autogen");
    expect(Framework.LLAMAINDEX).toBe("llamaindex");
  });

  it("FRAMEWORKS should list all framework values", () => {
    expect(FRAMEWORKS).toEqual(["langchain", "crewai", "autogen", "llamaindex"]);
    expect(FRAMEWORKS).toHaveLength(4);
  });
});

describe("AgentEvent", () => {
  it("should define all lifecycle events", () => {
    expect(AgentEvent.AGENT_START).toBe("agent_start");
    expect(AgentEvent.AGENT_END).toBe("agent_end");
    expect(AgentEvent.AGENT_ERROR).toBe("agent_error");
    expect(AgentEvent.STEP_START).toBe("step_start");
    expect(AgentEvent.STEP_END).toBe("step_end");
    expect(AgentEvent.TOOL_CALL).toBe("tool_call");
    expect(AgentEvent.TOOL_RESULT).toBe("tool_result");
    expect(AgentEvent.LLM_START).toBe("llm_start");
    expect(AgentEvent.LLM_END).toBe("llm_end");
  });
});
