import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the Postgres adapter.");
  }

  const client = postgres(process.env.DATABASE_URL, { prepare: false });
  return drizzle(client, { schema });
}
