import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  // Matches the new query in src/app/[game]/[slug]/page.tsx
  for (const slug of ["carrying-on-his-will", "azurite-sea", "adventure-on-kamis-island"]) {
    const set = await sql<{ id: number; set_code: string; name: string }[]>`
      SELECT s.id, s.set_code, s.name
      FROM sets s JOIN games g ON g.id = s.game_id
      WHERE s.slug = ${slug}
      LIMIT 1
    `;
    if (set.length === 0) { console.log(`(skip ${slug})`); continue; }
    const { id, set_code, name } = set[0];

    const cards = await sql`
      SELECT * FROM (
        SELECT DISTINCT ON (card_number)
          name, rarity, variant, card_number, current_market_cents, tcgplayer_product_id
        FROM cards
        WHERE set_id = ${id}
          AND current_market_cents IS NOT NULL
          AND (
            ${set_code}::text IS NULL
            OR card_number NOT LIKE '%-%'
            OR card_number ILIKE ${set_code} || '-%'
          )
        ORDER BY card_number, current_market_cents DESC
      ) dedup
      ORDER BY current_market_cents DESC
      LIMIT 12
    `;
    console.log(`\n=== ${set_code} ${name} chase (NEW deduped) ===`);
    for (const r of cards) {
      console.log(`  ${r.rarity.padEnd(14)} #${(r.card_number ?? "").padEnd(10)} $${(r.current_market_cents/100).toFixed(2).padStart(10)} tcg=${String(r.tcgplayer_product_id ?? "-").padStart(7)} ${r.variant ?? ""} | ${r.name}`);
    }
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
