import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The ticket service owns its connection. It may point to a different database than the app
 * (TICKETS_DATABASE_URL); by default both share one Postgres with separate schemas.
 */
function createDb() {
  const url = process.env.TICKETS_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  return drizzle(postgres(url, { max: 3 }), { schema });
}

type TicketsDb = ReturnType<typeof createDb>;
const globalForDb = globalThis as unknown as { ticketsDb?: TicketsDb };

export function getTicketsDb(): TicketsDb {
  if (!globalForDb.ticketsDb) globalForDb.ticketsDb = createDb();
  return globalForDb.ticketsDb;
}
