import { describe, expect, it } from "vitest";
import { classifyPriority, type PriorityInput } from "./priority";

const base: PriorityInput = { type: "INC", impact: "individual", blocksWork: false, sameDayCommitment: false, hasWorkaround: false };

describe("classifyPriority (Anexo A)", () => {
  it("Crítica when something is down for a team or the company", () => {
    expect(classifyPriority({ ...base, impact: "equipe", blocksWork: true }).priority).toBe("Crítica");
    expect(classifyPriority({ ...base, impact: "empresa", blocksWork: true }).priority).toBe("Crítica");
  });

  it("Alta when one person cannot work", () => {
    expect(classifyPriority({ ...base, blocksWork: true }).priority).toBe("Alta");
  });

  it("Alta when there is a commitment today, even for requests", () => {
    expect(classifyPriority({ ...base, type: "REQ", sameDayCommitment: true }).priority).toBe("Alta");
  });

  it("Média when it gets in the way but there is a workaround", () => {
    expect(classifyPriority({ ...base, blocksWork: true, hasWorkaround: true }).priority).toBe("Média");
    expect(classifyPriority(base).priority).toBe("Média");
  });

  it("a team with a workaround is not critical", () => {
    expect(classifyPriority({ ...base, impact: "equipe", blocksWork: true, hasWorkaround: true }).priority).toBe("Média");
  });

  it("Baixa for requests without urgency", () => {
    const r = classifyPriority({ ...base, type: "REQ" });
    expect(r.priority).toBe("Baixa");
    expect(r.slaLabel).toBe("5 dias úteis");
  });
});
