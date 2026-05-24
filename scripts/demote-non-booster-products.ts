import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

// One-shot fix: demote products that don't actually contain booster packs.
// Heuristic: real "this product yields packs you can rip" entries have one of
// `Booster`, `Elite Trainer Box`, or `Trove` in the name. Everything else
// (Poster Collection, Binder Collection, Surprise Box, Mini Tin, Gateway,
// Gift Box, Accessory Pouch, etc.) gets demoted to product_type='collection'
// with NULL pack_count so EV recalc skips it.

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  const preview = await sql<{ name: string; old_type: string; old_roi: number | null }[]>`
    SELECT name, product_type AS old_type, current_roi_pct::float AS old_roi
    FROM products
    WHERE pack_count IS NOT NULL
      AND name NOT ILIKE '%booster%'
      AND name NOT ILIKE '%elite trainer box%'
      AND name NOT ILIKE '%trove%'
    ORDER BY current_roi_pct DESC NULLS LAST
  `;
  console.log(`Demoting ${preview.length} non-booster products:`);
  for (const p of preview) {
    const roi = p.old_roi != null ? `${p.old_roi > 0 ? "+" : ""}${p.old_roi.toFixed(1)}%` : "-";
    console.log(`  was ${p.old_type.padEnd(15)} ROI=${roi.padEnd(8)} ${p.name}`);
  }

  const result = await sql`
    UPDATE products SET
      pack_count = NULL,
      cards_per_pack = NULL,
      current_ev_cents = NULL,
      current_roi_pct = NULL,
      product_type = 'collection'
    WHERE pack_count IS NOT NULL
      AND name NOT ILIKE '%booster%'
      AND name NOT ILIKE '%elite trainer box%'
      AND name NOT ILIKE '%trove%'
  `;
  console.log(`\nUpdated ${result.count} rows.`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
