import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { TicketsRequestError, TicketsUnavailableError } from "@/clients/tickets";
import { searchArticles } from "@/services/helpcenter/articles";
import { ACTIONS, INTENTS } from "@/shared/chat";
import {
  CATEGORIES,
  CategorySchema,
  ImpactSchema,
  STATUS_LABEL,
  type Ticket,
  TicketTypeSchema,
} from "@/shared/domain";
import { classifyPriority } from "@/shared/rules/priority";
import { computeDueAt, describeDeadline } from "@/shared/rules/sla";
import { canReopen, isActive, similarity, toTicketView } from "@/shared/rules/tickets";
import { type TurnServices, getTurn } from "../context";

/**
 * Agent tools. Conventions:
 * - Every result has a short `resumo` (shown in the decision trace) and never throws for expected failures:
 *   errors come back as { ok: false, erro } so the model can explain them to the employee.
 * - Identity comes from the turn context; no tool accepts a user id.
 * - Tools that change tickets only create drafts. The change happens when the employee confirms in the UI.
 */

type Fail = { ok: false; erro: string; resumo: string };

async function guarded<T extends object>(fn: () => Promise<T>): Promise<T | Fail> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TicketsUnavailableError) {
      return {
        ok: false,
        erro: `O sistema de chamados está fora do ar agora (tentei ${err.attempts} vezes). Peça para o funcionário tentar de novo em instantes.`,
        resumo: `sistema de chamados indisponível após ${err.attempts} tentativas`,
      };
    }
    if (err instanceof TicketsRequestError) {
      return { ok: false, erro: err.message, resumo: `erro ${err.status}: ${err.message}` };
    }
    throw err;
  }
}

function compact(t: Ticket, turn: TurnServices) {
  const v = toTicketView(t, turn.now);
  return {
    id: t.id,
    tipo: t.type,
    titulo: t.title,
    categoria: t.category,
    prioridade: t.priority,
    status: STATUS_LABEL[t.status],
    ativo: isActive(t),
    vencido: v.overdue,
    prazo: v.dueLabel,
    podeReabrir: canReopen(t, turn.now),
    atualizadoEm: t.updatedAt.slice(0, 10),
  };
}

const priorityFacts = {
  impact: ImpactSchema.describe("Quantas pessoas são afetadas: individual, equipe ou empresa"),
  blocksWork: z.boolean().describe("O problema impede de trabalhar?"),
  sameDayCommitment: z.boolean().describe("Há um compromisso hoje em risco (reunião, entrega, apresentação)?"),
  hasWorkaround: z.boolean().describe("Existe alternativa para continuar trabalhando?"),
};

export const searchHelpCenter = createTool({
  id: "searchHelpCenter",
  description:
    "Busca artigos na central de ajuda. Use antes de abrir chamado para dúvidas e problemas comuns. Leia as condições do artigo (ex.: vale só para Windows 10).",
  inputSchema: z.object({ query: z.string().min(2).describe("Palavras-chave do problema, ex.: 'vpn erro 809'") }),
  execute: async ({ query }) => {
    const hits = searchArticles(query);
    return {
      artigos: hits.map((h) => ({ id: h.article.id, titulo: h.article.title, conteudo: h.article.body, relevancia: Number(h.score.toFixed(2)) })),
      resumo: hits.length ? `${hits.length} artigo(s); melhor: ${hits[0].article.id} "${hits[0].article.title}"` : "nenhum artigo encontrado",
    };
  },
});

export const listMyTickets = createTool({
  id: "listMyTickets",
  description:
    "Lista os chamados do funcionário logado (somente dele), com status, prazo, se está vencido e se pode ser reaberto.",
  inputSchema: z.object({
    escopo: z.enum(["ativos", "todos"]).default("ativos").describe("ativos = em andamento; todos inclui resolvidos"),
  }),
  execute: async ({ escopo }, ctx) => {
    const turn = getTurn(ctx);
    return guarded(async () => {
      const all = await turn.tickets.list();
      const selected = escopo === "todos" ? all : all.filter((t) => isActive(t) || canReopen(t, turn.now));
      const chamados = selected.map((t) => compact(t, turn));
      const vencidos = chamados.filter((c) => c.vencido).length;
      return {
        ok: true as const,
        chamados,
        resumo: `${chamados.length} chamado(s)${vencidos ? `, ${vencidos} vencido(s)` : ""}`,
      };
    });
  },
});

export const getTicket = createTool({
  id: "getTicket",
  description: "Consulta um chamado do funcionário pelo número (ex.: INC-20311), com o histórico de atualizações.",
  inputSchema: z.object({ ticketId: z.string().regex(/^(INC|REQ)-\d+$/i) }),
  execute: async ({ ticketId }, ctx) => {
    const turn = getTurn(ctx);
    return guarded(async () => {
      const t = await turn.tickets.get(ticketId.toUpperCase());
      const c = compact(t, turn);
      return {
        ok: true as const,
        chamado: {
          ...c,
          descricao: t.description,
          historico: (t.events ?? []).slice(-5).map((e) => `${e.at.slice(0, 10)} ${e.author}: ${e.text}`),
        },
        resumo: `${t.id} ${c.status}${c.vencido ? " (vencido)" : ""}${c.prazo ? `, ${c.prazo}` : ""}`,
      };
    });
  },
});

export const findSimilarTickets = createTool({
  id: "findSimilarTickets",
  description:
    "Verifica se o funcionário já tem chamado ativo (ou resolvido há até 7 dias) sobre o mesmo problema. Use SEMPRE antes de propor um chamado novo.",
  inputSchema: z.object({ problema: z.string().min(3), categoria: CategorySchema.optional() }),
  execute: async ({ problema, categoria }, ctx) => {
    const turn = getTurn(ctx);
    return guarded(async () => {
      const all = await turn.tickets.list();
      const candidatos = all
        .filter((t) => isActive(t) || canReopen(t, turn.now))
        .map((t) => ({
          ...compact(t, turn),
          semelhanca: Number(
            (similarity(problema, `${t.title} ${t.description}`) + (categoria && t.category === categoria ? 0.2 : 0)).toFixed(2),
          ),
        }))
        .filter((t) => t.semelhanca >= 0.25)
        .sort((a, b) => b.semelhanca - a.semelhanca)
        .slice(0, 3);
      return {
        ok: true as const,
        candidatos,
        resumo: candidatos.length
          ? `possível duplicidade: ${candidatos.map((c) => `${c.id} (${c.semelhanca})`).join(", ")}`
          : "nenhum chamado parecido",
      };
    });
  },
});

export const classifyPriorityTool = createTool({
  id: "classifyPriority",
  description:
    "Calcula a prioridade e o prazo pelas regras do service desk a partir do impacto e da urgência. Nunca decida a prioridade sozinho.",
  inputSchema: z.object({ tipo: TicketTypeSchema, ...priorityFacts }),
  execute: async ({ tipo, ...facts }, ctx) => {
    const turn = getTurn(ctx);
    const r = classifyPriority({ type: tipo, ...facts });
    const prazo = describeDeadline(computeDueAt(r.priority, turn.now), turn.now);
    return {
      prioridade: r.priority,
      regra: r.rule,
      motivo: r.reason,
      sla: r.slaLabel,
      prazo,
      resumo: `${r.priority} (${r.rule}); ${prazo}`,
    };
  },
});

export const proposeTicketDraft = createTool({
  id: "proposeTicketDraft",
  description:
    "Mostra ao funcionário um rascunho de chamado NOVO para ele confirmar. Não cria o chamado: a criação só acontece quando ele clicar em Confirmar. A prioridade é calculada pelas regras a partir dos fatos.",
  inputSchema: z.object({
    tipo: TicketTypeSchema.describe("INC = algo parou/não funciona; REQ = pedido de acesso, equipamento ou software"),
    titulo: z.string().min(5).max(90),
    descricao: z
      .string()
      .min(20)
      .describe("Descrição completa para o analista: o que acontece, desde quando, o que já foi tentado, ambiente (SO, local)."),
    categoria: z.enum(CATEGORIES),
    afetados: z.string().min(2).describe("Quem é afetado, ex.: 'Ana Souza' ou 'Equipe de vendas (12 pessoas)'"),
    ...priorityFacts,
  }),
  execute: async (input, ctx) => {
    const turn = getTurn(ctx);
    const r = classifyPriority({ type: input.tipo, ...input });
    const prazo = describeDeadline(computeDueAt(r.priority, turn.now), turn.now);
    const draft = {
      type: input.tipo,
      title: input.titulo,
      description: input.descricao,
      category: input.categoria,
      priority: r.priority,
      affected: input.afetados,
    };
    const { id } = await turn.createDraft("create", null, draft);
    turn.addPart({
      type: "draft",
      draft: { id, kind: "create", status: "pending", ticket: { ...draft, deadlineLabel: `Prazo: ${r.slaLabel} (${prazo})` } },
    });
    return {
      rascunhoId: id,
      prioridade: r.priority,
      regra: r.rule,
      prazo,
      instrucao: "Rascunho exibido. Peça para o funcionário conferir e confirmar ou editar. NÃO diga que o chamado foi criado.",
      resumo: `rascunho ${input.tipo} "${input.titulo}" · ${input.categoria} · ${r.priority}`,
    };
  },
});

export const proposeTicketUpdate = createTool({
  id: "proposeTicketUpdate",
  description:
    "Mostra um rascunho de complemento para um chamado existente do funcionário (ou reabertura, se resolvido há até 7 dias). Só é aplicado após confirmação.",
  inputSchema: z.object({
    ticketId: z.string().regex(/^(INC|REQ)-\d+$/i),
    complemento: z.string().min(5).describe("Texto que será adicionado ao chamado, escrito para o analista"),
    reabrir: z.boolean().default(false),
  }),
  execute: async ({ ticketId, complemento, reabrir }, ctx) => {
    const turn = getTurn(ctx);
    return guarded(async () => {
      const t = await turn.tickets.get(ticketId.toUpperCase());
      if (reabrir && !canReopen(t, turn.now)) {
        return { ok: false as const, erro: `${t.id} não pode ser reaberto (resolvido há mais de 7 dias ou não está resolvido). Proponha um chamado novo.`, resumo: `${t.id} não pode ser reaberto` };
      }
      if (!reabrir && !isActive(t)) {
        return { ok: false as const, erro: `${t.id} está ${STATUS_LABEL[t.status].toLowerCase()}; para complementar é preciso reabrir (se possível) ou abrir outro.`, resumo: `${t.id} não está ativo` };
      }
      const view = toTicketView(t, turn.now);
      const { id } = await turn.createDraft("update", t.id, {
        type: t.type,
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        affected: t.affected,
        comment: complemento,
        reopen: reabrir,
      });
      turn.addPart({
        type: "draft",
        draft: {
          id,
          kind: "update",
          status: "pending",
          ticketId: t.id,
          comment: complemento,
          reopen: reabrir,
          ticket: {
            type: t.type,
            title: t.title,
            description: t.description,
            category: t.category,
            priority: t.priority,
            affected: t.affected,
            deadlineLabel: view.dueLabel ?? "",
          },
        },
      });
      return {
        ok: true as const,
        rascunhoId: id,
        instrucao: "Rascunho de atualização exibido. Peça confirmação. NÃO diga que já foi atualizado.",
        resumo: `${reabrir ? "reabertura" : "complemento"} de ${t.id}`,
      };
    });
  },
});

export const showTickets = createTool({
  id: "showTickets",
  description:
    "Mostra chamados na tela. modo 'cartao' = cartão com status e prazo de um chamado; modo 'escolha' = lista para o funcionário escolher qual chamado (use quando houver mais de um candidato e não estiver claro qual).",
  inputSchema: z.object({
    ticketIds: z.array(z.string().regex(/^(INC|REQ)-\d+$/i)).min(1).max(6),
    modo: z.enum(["cartao", "escolha"]),
    pergunta: z.string().optional().describe("Texto acima da lista no modo escolha"),
  }),
  execute: async ({ ticketIds, modo, pergunta }, ctx) => {
    const turn = getTurn(ctx);
    return guarded(async () => {
      const wanted = new Set(ticketIds.map((i) => i.toUpperCase()));
      const tickets = (await turn.tickets.list()).filter((t) => wanted.has(t.id)).map((t) => toTicketView(t, turn.now));
      if (tickets.length === 0) return { ok: false as const, erro: "Nenhum desses chamados pertence ao funcionário.", resumo: "nenhum chamado encontrado" };
      if (modo === "escolha") {
        turn.addPart({ type: "ticketChoice", prompt: pergunta ?? "Qual destes chamados?", tickets });
      } else {
        for (const ticket of tickets) turn.addPart({ type: "ticket", ticket });
      }
      return { ok: true as const, exibidos: tickets.map((t) => t.id), resumo: `exibiu ${tickets.map((t) => t.id).join(", ")}` };
    });
  },
});

export const offerQuickReplies = createTool({
  id: "offerQuickReplies",
  description:
    "Mostra botões de resposta rápida abaixo da sua mensagem (2 a 4 opções curtas). Use em perguntas fechadas, ex.: ['Só eu', 'Minha equipe', 'Toda a empresa'].",
  inputSchema: z.object({ opcoes: z.array(z.string().min(1).max(40)).min(2).max(4) }),
  execute: async ({ opcoes }, ctx) => {
    getTurn(ctx).addPart({ type: "options", options: opcoes });
    return { ok: true as const, resumo: opcoes.join(" / ") };
  },
});

export const transferToAnalyst = createTool({
  id: "transferToAnalyst",
  description:
    "Transfere a conversa para um analista humano. Use quando o funcionário pedir, em casos críticos, quando um chamado estiver vencido e o funcionário aceitar, ou quando você não tiver segurança. Depois disso você para de responder.",
  inputSchema: z.object({
    motivo: z.enum(["pedido_do_funcionario", "caso_critico", "chamado_vencido", "baixa_confianca"]),
    resumoDoCaso: z
      .string()
      .min(20)
      .describe("Resumo para o analista: quem, o problema, o que já foi feito/tentado, chamados envolvidos. O analista não deve precisar perguntar de novo."),
    ticketId: z.string().regex(/^(INC|REQ)-\d+$/i).optional(),
  }),
  execute: async ({ motivo, resumoDoCaso, ticketId }, ctx) => {
    const turn = getTurn(ctx);
    await turn.handoff(motivo, resumoDoCaso, ticketId?.toUpperCase());
    return {
      ok: true as const,
      instrucao: "Conversa transferida. Avise o funcionário que um analista vai continuar o atendimento aqui mesmo.",
      resumo: `transferido (${motivo})${ticketId ? ` com ${ticketId}` : ""}`,
    };
  },
});

export const recordDecision = createTool({
  id: "recordDecision",
  description:
    "Registra a sua decisão neste turno, para transparência. Chame exatamente uma vez por turno, depois das outras ferramentas e antes de escrever a resposta final.",
  inputSchema: z.object({
    intent: z.enum(INTENTS),
    understood: z.string().min(5).describe("O que você entendeu do pedido, em uma frase"),
    facts: z
      .array(z.object({ name: z.string(), value: z.string() }))
      .max(8)
      .describe("Fatos extraídos, ex.: categoria, impacto, sistema operacional, chamado citado"),
    action: z.enum(ACTIONS),
    confidence: z.number().min(0).max(1).describe("Sua segurança de que esta é a ação certa (0 a 1)"),
    reason: z.string().min(5).describe("Por que esta ação, citando regras/artigos/chamados"),
    rulesApplied: z.array(z.string()).max(6).describe("Regras do service desk aplicadas, ex.: 'Sem duplicidade', 'Confirmação antes de criar'"),
  }),
  execute: async (decision, ctx) => {
    getTurn(ctx).recordDecision(decision);
    return { ok: true as const, resumo: `${decision.action} (${Math.round(decision.confidence * 100)}%)` };
  },
});

export const agentTools = {
  searchHelpCenter,
  listMyTickets,
  getTicket,
  findSimilarTickets,
  classifyPriority: classifyPriorityTool,
  proposeTicketDraft,
  proposeTicketUpdate,
  showTickets,
  offerQuickReplies,
  transferToAnalyst,
  recordDecision,
};

export type AgentToolName = keyof typeof agentTools;
