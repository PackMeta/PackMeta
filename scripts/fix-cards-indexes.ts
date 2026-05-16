import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED;
  if (!url) throw new Error("DATABASE_URL_POOLED not set");
  const sql = postgres(url, { prepare: false });

  await sql`DROP INDEX IF EXISTS cards_set_number_variant_idx`;
  await sql`CREATE INDEX cards_set_number_variant_idx ON cards (set_id, card_number, variant)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS cards_justtcg_card_id_idx ON cards (justtcg_card_id)`;

  console.log("indexes updated:");
  const idx = await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'cards'
    ORDER BY indexname
  `;
  for (const i of idx) console.log(`  ${i.indexname}: ${i.indexdef}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
