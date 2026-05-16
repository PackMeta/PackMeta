import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED;
  if (!url) throw new Error("DATABASE_URL_POOLED not set");

  const sql = postgres(url, { prepare: false });

  const games = await sql`SELECT slug, name FROM games`;
  const sets = await sql`SELECT set_code, slug, name FROM sets ORDER BY set_code`;

  console.log("games:", games);
  console.log(`sets (${sets.length} rows):`);
  for (const s of sets) console.log(`  ${s.set_code} ${s.slug.padEnd(24)} ${s.name}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
