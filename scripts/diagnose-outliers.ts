import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  console.log("=== POKEMON products with 'Case' in name ===");
  const pokeCase = await sql`
    SELECT s.set_code, p.product_type, p.pack_count, p.current_market_cents, p.current_ev_cents, p.current_roi_pct, p.name
    FROM products p
    JOIN sets s ON s.id = p.set_id
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'pokemon' AND p.name ILIKE '%case%'
    ORDER BY p.current_roi_pct DESC NULLS LAST
  `;
  for (const r of pokeCase) {
    console.log(`  ${r.set_code} type=${r.product_type} pc=${r.pack_count} price=${r.current_market_cents} ev=${r.current_ev_cents} roi=${r.current_roi_pct} | ${r.name}`);
  }

  console.log("\n=== LORCANA Azurite Sea (S5) all products ===");
  const s5 = await sql`
    SELECT p.id, s.set_code, p.product_type, p.pack_count, p.current_market_cents, p.current_ev_cents, p.current_roi_pct, p.name
    FROM products p
    JOIN sets s ON s.id = p.set_id
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'lorcana' AND s.slug = 'azurite-sea'
    ORDER BY p.current_market_cents DESC NULLS LAST
  `;
  for (const r of s5) {
    console.log(`  id=${r.id} type=${r.product_type} pc=${r.pack_count} price=${r.current_market_cents} ev=${r.current_ev_cents} roi=${r.current_roi_pct} | ${r.name}`);
  }

  console.log("\n=== ONE PIECE sets list ===");
  const opSets = await sql`
    SELECT s.id, s.set_code, s.slug, s.name, s.release_date::text,
           (SELECT COUNT(*)::int FROM cards WHERE set_id = s.id) AS card_count
    FROM sets s JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'one-piece'
    ORDER BY s.release_date DESC NULLS LAST
  `;
  for (const r of opSets) {
    console.log(`  ${r.set_code} ${r.slug} | ${r.name} | ${r.release_date} | cards=${r.card_count}`);
  }

  console.log("\n=== ONE PIECE most recent set top 20 chase cards (by market) ===");
  const opTop = await sql`
    SELECT c.name, c.rarity, c.variant, c.card_number, c.current_market_cents
    FROM cards c
    JOIN sets s ON s.id = c.set_id
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'one-piece'
      AND s.set_code IN ('OP13', 'OP-13', 'op13')
      AND c.current_market_cents IS NOT NULL
    ORDER BY c.current_market_cents DESC
    LIMIT 25
  `;
  if (opTop.length === 0) {
    console.log("  no OP13 found — trying latest by release date:");
    const opLatest = await sql`
      SELECT c.name, c.rarity, c.variant, c.card_number, c.current_market_cents, s.set_code
      FROM cards c
      JOIN sets s ON s.id = c.set_id
      JOIN games g ON g.id = s.game_id
      WHERE g.slug = 'one-piece' AND s.release_date IS NOT NULL
        AND c.current_market_cents IS NOT NULL
        AND s.id = (SELECT id FROM sets WHERE game_id = (SELECT id FROM games WHERE slug='one-piece') ORDER BY release_date DESC NULLS LAST LIMIT 1)
      ORDER BY c.current_market_cents DESC
      LIMIT 25
    `;
    for (const r of opLatest) {
      console.log(`  ${r.set_code} ${r.rarity} #${r.card_number} $${(r.current_market_cents/100).toFixed(2)} ${r.variant ?? ""} | ${r.name}`);
    }
  } else {
    for (const r of opTop) {
      console.log(`  ${r.rarity} #${r.card_number} $${(r.current_market_cents/100).toFixed(2)} ${r.variant ?? ""} | ${r.name}`);
    }
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
