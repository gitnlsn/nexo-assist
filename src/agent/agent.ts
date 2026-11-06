import { Agent } from "@mastra/core/agent";
import { type AgentRequestContext, getTurn } from "./context";
import { buildInstructions } from "./instructions";
import { agentTools } from "./tools";

export const DEFAULT_MODEL = "google/gemini-3.5-flash-lite";

export function agentModel(): string {
  return process.env.AGENT_MODEL || DEFAULT_MODEL;
}

export const nexoAssist = new Agent<"nexo-assist", typeof agentTools>({
  id: "nexo-assist",
  name: "Nexo Assist",
  description: "Agent do service desk de TI da Nexo",
  instructions: ({ requestContext }) => buildInstructions(getTurn({ requestContext }) ),
  model: () => agentModel(),
  tools: agentTools,
});

export type { AgentRequestContext };
