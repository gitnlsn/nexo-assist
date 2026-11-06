import type { Impact, Priority, TicketType } from "../domain";
import { SLA_RULES } from "./sla";

/**
 * Priority = impact (how many people) × urgency (is there a commitment at risk / can the person work).
 * The LLM extracts these facts from the conversation; this function makes the decision deterministically,
 * so the same facts always produce the same priority and the reason can be shown to the user.
 */
export interface PriorityInput {
  type: TicketType;
  impact: Impact;
  /** The problem stops the affected people from working. */
  blocksWork: boolean;
  /** There is a commitment at risk today (meeting, delivery, presentation...). */
  sameDayCommitment: boolean;
  /** There is a workaround that lets the person keep working. */
  hasWorkaround: boolean;
}

export interface PriorityResult {
  priority: Priority;
  rule: string;
  reason: string;
  slaLabel: string;
}

export function classifyPriority(input: PriorityInput): PriorityResult {
  const { type, impact, blocksWork, sameDayCommitment, hasWorkaround } = input;
  const many = impact === "equipe" || impact === "empresa";
  const who = impact === "empresa" ? "a empresa" : impact === "equipe" ? "uma equipe" : "uma pessoa";

  let priority: Priority;
  let rule: string;
  let reason: string;

  if (many && blocksWork && !hasWorkaround) {
    priority = "Crítica";
    rule = "P1: algo parado para uma equipe ou para a empresa";
    reason = `Está parado para ${who}, sem alternativa.`;
  } else if ((blocksWork && !hasWorkaround) || sameDayCommitment) {
    priority = "Alta";
    rule = "P2: impede uma pessoa de trabalhar ou há compromisso no mesmo dia";
    reason = sameDayCommitment
      ? "Há um compromisso hoje que depende disso."
      : `Impede ${who} de trabalhar.`;
  } else if (type === "INC") {
    priority = "Média";
    rule = "P3: atrapalha, mas há alternativa";
    reason = hasWorkaround
      ? "Atrapalha, mas existe uma alternativa para continuar trabalhando."
      : "Atrapalha o trabalho, mas não o impede.";
  } else {
    priority = "Baixa";
    rule = "P4: pedido ou melhoria sem urgência";
    reason = "É um pedido sem urgência.";
  }

  return { priority, rule, reason, slaLabel: SLA_RULES[priority].label };
}
