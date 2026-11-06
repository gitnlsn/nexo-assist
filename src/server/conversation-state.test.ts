import { describe, expect, it } from "vitest";
import { InvalidTransitionError, agentCanRespond, transition } from "./conversation-state";

describe("conversation handoff state machine", () => {
  it("follows the handoff → assume → release cycle", () => {
    const waiting = transition("agent", "handoff");
    expect(waiting).toBe("waiting_analyst");
    const withAnalyst = transition(waiting, "assume");
    expect(withAnalyst).toBe("with_analyst");
    expect(transition(withAnalyst, "release")).toBe("agent");
  });

  it("the agent is paused whenever an analyst is involved", () => {
    expect(agentCanRespond("agent")).toBe(true);
    expect(agentCanRespond("waiting_analyst")).toBe(false);
    expect(agentCanRespond("with_analyst")).toBe(false);
    expect(agentCanRespond("closed")).toBe(false);
  });

  it("rejects invalid transitions", () => {
    expect(() => transition("closed", "release")).toThrow(InvalidTransitionError);
    expect(() => transition("with_analyst", "handoff")).toThrow(InvalidTransitionError);
  });
});
