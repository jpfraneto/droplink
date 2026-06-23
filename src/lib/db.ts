import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: postgres.Sql | null = null;

export function assertProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production. Local JSON storage is development-only.");
  }
  if (!process.env.ALLOW_MOCKS && !process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required in production unless ALLOW_MOCKS=true is explicit.");
  }
}

export function usePostgres(): boolean {
  assertProductionConfig();
  return Boolean(process.env.DATABASE_URL);
}

export function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the Postgres adapter.");
  }
  if (!client) client = postgres(process.env.DATABASE_URL, { prepare: false });
  return client;
}

export function createDb() {
  return drizzle(sql(), { schema });
}
