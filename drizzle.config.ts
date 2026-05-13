import type { Config } from "drizzle-kit";
import "dotenv/config";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL_DIRECT (or DATABASE_URL) must be set for migrations",
  );
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
