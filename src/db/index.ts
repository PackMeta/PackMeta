import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL_POOLED or DATABASE_URL must be set in environment",
  );
}

// Use a single connection in serverless. `prepare: false` is required when
// hitting Supabase's pgBouncer pooler (Transaction mode).
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
