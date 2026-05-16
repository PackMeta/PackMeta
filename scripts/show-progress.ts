import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  console.log("=== PER-SET COUNTS ===");
  const setRows = await sql`
    SELECT s.set_code, s.slug, COUNT(c.id)::int AS card_count, COUNT(c.current_market_cents)::int AS priced
    FROM sets s
    LEFT JOIN cards c ON c.set_id = s.id
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'lorcana'
    GROUP BY s.set_code, s.slug, s.release_date
    ORDER BY s.release_date NULLS LAST, s.set_code
  `;
  for (const r of setRows) {
    const status = r.card_count > 0 ? "✓" : "—";
    console.log(`  ${status} ${r.set_code.padEnd(4)} ${r.slug.padEnd(24)} ${r.card_count.toString().padStart(3)} cards / ${r.priced} priced`);
  }

  const [{ total_cards }] = await sql<{ total_cards: number }[]>`SELECT COUNT(*)::int AS total_cards FROM cards`;
  const [{ total_prices }] = await sql<{ total_prices: number }[]>`SELECT COUNT(*)::int AS total_prices FROM prices`;
  console.log(`\nTotal cards: ${total_cards}`);
  console.log(`Total price snapshots: ${total_prices}`);

  console.log("\n=== TOP 15 MOST EXPENSIVE LORCANA CARDS (loaded so far) ===");
  const top = await sql`
    SELECT s.set_code, c.name, c.rarity, c.variant, c.current_market_cents
    FROM cards c JOIN sets s ON s.id = c.set_id
    WHERE c.current_market_cents IS NOT NULL
    ORDER BY c.current_market_cents DESC
    LIMIT 15
  `;
  for (const r of top) {
    const usd = `$${(r.current_market_cents / 100).toFixed(2)}`;
    console.log(`  ${r.set_code.padEnd(4)} ${usd.padStart(9)}  ${r.rarity.padEnd(14)} ${r.variant.padEnd(10)} ${r.name}`);
  }

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
