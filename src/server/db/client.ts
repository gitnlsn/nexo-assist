import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const client = postgres(url, { max: 5 });
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDb>;

// Reuse the connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { appDb?: Db };

export function getDb(): Db {
  if (!globalForDb.appDb) globalForDb.appDb = createDb();
  return globalForDb.appDb;
}
