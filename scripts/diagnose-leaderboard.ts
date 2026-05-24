import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  console.log("=== CURRENT LEADERBOARD (matches home page query) ===");
  const hot = await sql`
    SELECT s.slug AS set_slug, s.set_code, s.name AS set_name, g.slug AS game_slug,
           p.name AS product_name, p.product_type, p.pack_count,
           p.current_market_cents AS market_cents,
           p.current_ev_cents AS ev_cents,
           p.current_roi_pct::float AS roi_pct
    FROM products p
    JOIN sets s ON s.id = p.set_id
    JOIN games g ON g.id = s.game_id
    WHERE p.current_roi_pct IS NOT NULL
      AND p.current_market_cents IS NOT NULL
      AND p.current_market_cents > 1000
      AND p.current_roi_pct BETWEEN 0 AND 100
      AND p.product_type IN ('booster_pack', 'sleeved_booster_pack', 'booster_box', 'booster_case', 'trove')
    ORDER BY p.current_roi_pct DESC
    LIMIT 20
  `;
  for (const r of hot) {
    console.log(`  ${r.game_slug.padEnd(10)} ${r.set_code.padEnd(6)} ROI=${r.roi_pct.toFixed(1).padStart(6)}% price=$${(r.market_cents/100).toFixed(2)} ev=$${(r.ev_cents/100).toFixed(2)} type=${r.product_type.padEnd(15)} | ${r.product_name}`);
  }

  console.log("\n=== ANY product with 'gateway' in name ===");
  const gw = await sql`
    SELECT g.slug AS game, s.set_code, p.product_type, p.pack_count, p.current_market_cents, p.current_ev_cents, p.current_roi_pct, p.name
    FROM products p
    JOIN sets s ON s.id = p.set_id
    JOIN games g ON g.id = s.game_id
    WHERE p.name ILIKE '%gateway%'
    ORDER BY p.current_roi_pct DESC NULLS LAST
  `;
  for (const r of gw) {
    console.log(`  ${r.game} ${r.set_code} type=${r.product_type} pc=${r.pack_count} price=${r.current_market_cents} ev=${r.current_ev_cents} roi=${r.current_roi_pct} | ${r.name}`);
  }

  console.log("\n=== LORCANA Azurite Sea (S5) detail page query (matches [game]/[slug]) ===");
  const s5products = await sql`
    SELECT p.slug, p.name, p.product_type, p.pack_count, p.current_market_cents, p.current_ev_cents, p.current_roi_pct::float AS roi
    FROM products p
    JOIN sets s ON s.id = p.set_id
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'lorcana' AND s.slug = 'azurite-sea'
    ORDER BY CASE WHEN p.current_roi_pct IS NULL THEN 1 ELSE 0 END,
             p.current_roi_pct DESC NULLS LAST,
             p.pack_count NULLS LAST
  `;
  for (const r of s5products) {
    console.log(`  ${r.product_type.padEnd(20)} pc=${r.pack_count} price=${r.current_market_cents} ev=${r.current_ev_cents} roi=${r.roi} | ${r.name}`);
  }

  console.log("\n=== OP13 top chase cards as displayed (LIMIT 12, no filter) ===");
  const op13 = await sql`
    SELECT c.name, c.rarity, c.variant, c.card_number, c.current_market_cents
    FROM cards c
    JOIN sets s ON s.id = c.set_id
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'one-piece' AND s.slug = 'carrying-on-his-will'
      AND c.current_market_cents IS NOT NULL
    ORDER BY c.current_market_cents DESC
    LIMIT 12
  `;
  for (const r of op13) {
    console.log(`  ${r.rarity.padEnd(15)} #${r.card_number} $${(r.current_market_cents/100).toFixed(2).padStart(10)} ${(r.variant ?? "").padEnd(8)} | ${r.name}`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
