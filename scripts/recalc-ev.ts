import "dotenv/config";
import postgres from "postgres";
import { simulate, type SetData, type CardLite, type SlotRate } from "../src/lib/ev";

const ITERATIONS = 10_000;

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  const sets = await sql<{ id: number; slug: string; set_code: string; game_slug: string }[]>`
    SELECT s.id, s.slug, s.set_code, g.slug AS game_slug
    FROM sets s JOIN games g ON g.id = s.game_id
    ORDER BY g.slug, s.release_date NULLS LAST, s.set_code
  `;

  console.log(`Recalculating EV for ${sets.length} sets...\n`);
  const startedAt = Date.now();

  for (const set of sets) {
    // 1. Load cards keyed by rarity, with current price in cents
    // Exclude special variant prints from EV sampling — they share a rarity
    // label with regular cards but are 100x rarer in real packs.
    const cardRows = await sql<{ rarity: string; current_market_cents: number | null }[]>`
      SELECT rarity, current_market_cents
      FROM cards
      WHERE set_id = ${set.id} AND current_market_cents IS NOT NULL
        AND name NOT ILIKE '%(Alternate Art)%'
        AND name NOT ILIKE '%(Manga)%'
        AND name NOT ILIKE '%(Parallel)%'
        AND name NOT ILIKE '%(Gold-Stamped%'
        AND name NOT ILIKE '%(SP)%'
        AND name NOT ILIKE '%(Special Card)%'
        AND name NOT ILIKE '%(Treasure)%'
        AND name NOT ILIKE '%(Super%Alternate%'
    `;
    const cardsByRarity = new Map<string, CardLite[]>();
    for (const r of cardRows) {
      const arr = cardsByRarity.get(r.rarity) ?? [];
      arr.push({ rarity: r.rarity, marketCents: r.current_market_cents! });
      cardsByRarity.set(r.rarity, arr);
    }

    if (cardRows.length === 0) {
      console.log(`  ${set.set_code.padEnd(4)} ${set.slug.padEnd(24)} (skipped — no cards loaded)`);
      continue;
    }

    // 2. Load pull rates by slot
    const rateRows = await sql<{ slot_index: number; rarity: string; probability: string }[]>`
      SELECT slot_index, rarity, probability::text AS probability
      FROM pull_rate_templates
      WHERE set_id = ${set.id} AND pack_type = 'booster_pack'
      ORDER BY slot_index
    `;
    const ratesBySlot = new Map<number, SlotRate[]>();
    for (const r of rateRows) {
      const arr = ratesBySlot.get(r.slot_index) ?? [];
      arr.push({ slotIndex: r.slot_index, rarity: r.rarity, probability: Number(r.probability) });
      ratesBySlot.set(r.slot_index, arr);
    }

    if (rateRows.length === 0) {
      console.log(`  ${set.set_code.padEnd(4)} ${set.slug.padEnd(24)} (skipped — no pull rates)`);
      continue;
    }

    const setData: SetData = { cardsByRarity, ratesBySlot, cardsPerPack: 12 };

    // 3. For each product in this set with a pack_count, simulate
    const products = await sql<{ id: number; slug: string; name: string; product_type: string; pack_count: number | null; current_market_cents: number | null }[]>`
      SELECT id, slug, name, product_type, pack_count, current_market_cents
      FROM products
      WHERE set_id = ${set.id} AND pack_count IS NOT NULL
      ORDER BY pack_count
    `;

    // Also calc a synthetic "single pack" EV at the set level, just for display
    const packEv = simulate(setData, 1, ITERATIONS);
    console.log(`  ${set.set_code.padEnd(4)} ${set.slug.padEnd(24)} pack EV: $${(packEv.meanCents / 100).toFixed(2)} (p25 $${(packEv.p25Cents / 100).toFixed(2)} / p75 $${(packEv.p75Cents / 100).toFixed(2)})`);

    for (const p of products) {
      if (!p.pack_count) continue;
      const result = simulate(setData, p.pack_count, ITERATIONS);
      const roi = p.current_market_cents != null && p.current_market_cents > 0
        ? ((result.meanCents - p.current_market_cents) / p.current_market_cents) * 100
        : null;

      await sql`
        UPDATE products
        SET current_ev_cents = ${result.meanCents},
            current_roi_pct = ${roi},
            last_calculated_at = NOW()
        WHERE id = ${p.id}
      `;

      const price = p.current_market_cents != null ? `$${(p.current_market_cents / 100).toFixed(2)}` : "—";
      const ev = `$${(result.meanCents / 100).toFixed(2)}`;
      const roiStr = roi != null ? `${roi > 0 ? "+" : ""}${roi.toFixed(1)}%` : "—";
      console.log(`        ${p.product_type.padEnd(22)} ${p.pack_count.toString().padStart(3)}pk  price=${price.padStart(9)}  EV=${ev.padStart(9)}  ROI=${roiStr.padStart(7)}`);
    }
  }

  console.log(`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);

  console.log(`\n=== TOP 10 ROI PRODUCTS (Rip It) ===`);
  const top = await sql`
    SELECT s.set_code, p.product_type, p.name, p.current_market_cents, p.current_ev_cents, p.current_roi_pct
    FROM products p JOIN sets s ON s.id = p.set_id
    WHERE p.current_roi_pct IS NOT NULL
    ORDER BY p.current_roi_pct DESC
    LIMIT 10
  `;
  for (const r of top) {
    const price = `$${(r.current_market_cents / 100).toFixed(2)}`;
    const ev = `$${(r.current_ev_cents / 100).toFixed(2)}`;
    const roi = `${r.current_roi_pct > 0 ? "+" : ""}${Number(r.current_roi_pct).toFixed(1)}%`;
    console.log(`  ${r.set_code.padEnd(4)} ROI=${roi.padStart(8)}  price=${price.padStart(9)}  EV=${ev.padStart(9)}  ${r.product_type.padEnd(20)} ${r.name}`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
