/**
 * Seeds sample data (Anexo B): employees, analysts and tickets in varied situations.
 * Dates are relative to "now" so the demo always has an overdue ticket, a recently resolved one, etc.
 * Idempotent: wipes app + tickets data and recreates it.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { sql } from "drizzle-orm";
import { computeDueAt } from "../src/shared/rules/sla";
import type { Priority } from "../src/shared/domain";
import { getDb } from "../src/server/db/client";
import { usersTable } from "../src/server/db/schema";
import { getTicketsDb } from "../src/services/tickets/db";
import { ticketEventsTable, ticketsTable } from "../src/services/tickets/schema";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY);

const users = [
  { id: "u-ana", email: "ana.souza@nexo.com.br", name: "Ana Souza", role: "employee", department: "Financeiro", title: "Analista financeira" },
  { id: "u-bruno", email: "bruno.tavares@nexo.com.br", name: "Bruno Tavares", role: "employee", department: "Comercial", title: "Executivo de contas" },
  { id: "u-carla", email: "carla.mendes@nexo.com.br", name: "Carla Mendes", role: "employee", department: "Operações", title: "Coordenadora de operações" },
  { id: "u-diego", email: "diego.ramos@nexo.com.br", name: "Diego Ramos", role: "employee", department: "Marketing", title: "Designer" },
  { id: "u-elisa", email: "elisa.prado@nexo.com.br", name: "Elisa Prado", role: "employee", department: "Jurídico", title: "Advogada" },
  { id: "u-fabio", email: "fabio.nunes@nexo.com.br", name: "Fábio Nunes", role: "analyst", department: "TI", title: "Suporte N1" },
  { id: "u-gabriela", email: "gabriela.rocha@nexo.com.br", name: "Gabriela Rocha", role: "analyst", department: "TI", title: "Suporte N2" },
] as const;

interface SeedTicket {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  status: string;
  createdDaysAgo: number;
  updatedDaysAgo: number;
  resolvedDaysAgo?: number;
  /** Override for dueAt in days from now (negative = overdue). Defaults to SLA from last update. */
  dueInDays?: number;
  affected?: string;
  queue?: "N1" | "N2";
}

const tickets: SeedTicket[] = [
  // Ana — the main demo user: overdue, approved, recently resolved, old resolved, open.
  {
    id: "INC-20311", requesterId: "u-ana", title: "Notebook lento após atualização do Windows",
    description: "Depois da atualização do Windows de segunda, o notebook leva 10 minutos para abrir o Excel e trava em chamadas do Teams.",
    category: "Hardware", priority: "Média", status: "waiting_analyst", createdDaysAgo: 8, updatedDaysAgo: 6,
  },
  {
    id: "REQ-10442", requesterId: "u-ana", title: "Segundo monitor para home office",
    description: "Solicito um segundo monitor para o home office. Aprovado pela gestora Marina.",
    category: "Hardware", priority: "Baixa", status: "approved", createdDaysAgo: 10, updatedDaysAgo: 7, dueInDays: 2,
  },
  {
    id: "INC-20150", requesterId: "u-ana", title: "Senha do SAP bloqueada",
    description: "A senha do SAP bloqueou depois de três tentativas.",
    category: "Acesso", priority: "Média", status: "resolved", createdDaysAgo: 6, updatedDaysAgo: 4, resolvedDaysAgo: 4,
  },
  {
    id: "INC-19877", requesterId: "u-ana", title: "Outlook não sincroniza no celular",
    description: "O Outlook do celular parou de receber e-mails.",
    category: "E-mail", priority: "Baixa", status: "resolved", createdDaysAgo: 15, updatedDaysAgo: 12, resolvedDaysAgo: 12,
  },
  {
    id: "INC-20488", requesterId: "u-ana", title: "VPN desconecta a cada 30 minutos",
    description: "A VPN conecta normalmente, mas cai a cada 30 minutos e preciso reconectar. Uso Windows 11.",
    category: "Rede e VPN", priority: "Média", status: "open", createdDaysAgo: 1, updatedDaysAgo: 1,
  },
  // Other employees — must never be visible to Ana.
  {
    id: "INC-19410", requesterId: "u-bruno", title: "Impressora do 3º andar não imprime",
    description: "A impressora do 3º andar aparece offline.", category: "Hardware", priority: "Média",
    status: "in_progress", createdDaysAgo: 3, updatedDaysAgo: 1,
  },
  {
    id: "REQ-10471", requesterId: "u-bruno", title: "Acesso ao Power BI de vendas",
    description: "Preciso de acesso ao workspace de vendas no Power BI.", category: "Acesso", priority: "Baixa",
    status: "open", createdDaysAgo: 2, updatedDaysAgo: 2,
  },
  {
    id: "INC-20460", requesterId: "u-carla", title: "Sistema de ponto fora do ar para a equipe de operações",
    description: "Ninguém da equipe de operações consegue registrar o ponto desde as 7h.", category: "Software",
    priority: "Crítica", status: "waiting_analyst", createdDaysAgo: 0.1, updatedDaysAgo: 0.1,
    affected: "Equipe de operações (40 pessoas)", queue: "N2",
  },
  {
    id: "REQ-10480", requesterId: "u-diego", title: "Licença do Adobe Illustrator",
    description: "Preciso do Illustrator para a nova campanha.", category: "Software", priority: "Baixa",
    status: "open", createdDaysAgo: 1, updatedDaysAgo: 1,
  },
];

async function main() {
  const db = getDb();
  const tdb = getTicketsDb();

  await db.execute(sql`truncate app.drafts, app.messages, app.conversations, app.users cascade`);
  await tdb.execute(sql`truncate tickets.ticket_events, tickets.tickets cascade`);

  await db.insert(usersTable).values([...users]);

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  for (const t of tickets) {
    const updatedAt = ago(t.updatedDaysAgo);
    const active = t.status !== "resolved" && t.status !== "closed";
    const dueAt = !active
      ? null
      : t.dueInDays !== undefined
        ? new Date(now + t.dueInDays * DAY)
        : computeDueAt(t.priority, updatedAt);
    await tdb.insert(ticketsTable).values({
      id: t.id,
      type: t.id.startsWith("INC") ? "INC" : "REQ",
      title: t.title,
      description: t.description,
      category: t.category,
      priority: t.priority,
      affected: t.affected ?? nameOf(t.requesterId),
      requesterId: t.requesterId,
      status: t.status,
      queue: t.queue ?? "N1",
      createdAt: ago(t.createdDaysAgo),
      updatedAt,
      dueAt,
      resolvedAt: t.resolvedDaysAgo !== undefined ? ago(t.resolvedDaysAgo) : null,
    });
    await tdb.insert(ticketEventsTable).values({
      ticketId: t.id, at: ago(t.createdDaysAgo), author: nameOf(t.requesterId), kind: "created", text: t.description,
    });
    if (t.updatedDaysAgo !== t.createdDaysAgo) {
      await tdb.insert(ticketEventsTable).values({
        ticketId: t.id, at: updatedAt, author: "Service desk", kind: "status",
        text: t.status === "resolved" ? "Chamado resolvido." : "Chamado em análise pelo service desk.",
      });
    }
  }

  console.log(`Seeded ${users.length} users and ${tickets.length} tickets.`);
  console.log("Log in as ana.souza@nexo.com.br (employee) or fabio.nunes@nexo.com.br (analyst), any password.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
