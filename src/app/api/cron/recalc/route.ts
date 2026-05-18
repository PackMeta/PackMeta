import { NextResponse } from "next/server";
import postgres from "postgres";
import { simulate, type SetData, type CardLite, type SlotRate } from "@/lib/ev";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap

// Cron uses 3K iterations to stay under Vercel Hobby's 60s function limit.
// Local recalc-ev.ts script uses 10K for higher-precision one-shot recalcs.
const ITERATIONS = 3_000;

export async function GET(req: Request) {
  // Auth — Vercel Cron sets Authorization: Bearer ${CRON_SECRET}
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL_POOLED;
  if (!dbUrl) return NextResponse.json({ error: "DATABASE_URL_POOLED not set" }, { status: 500 });
  const sql = postgres(dbUrl, { prepare: false });

  const started = Date.now();
  const summary: { game: string; set: string; productsUpdated: number }[] = [];

  try {
    const sets = await sql<{ id: number; slug: string; set_code: string; game_slug: string }[]>`
      SELECT s.id, s.slug, s.set_code, g.slug AS game_slug
      FROM sets s JOIN games g ON g.id = s.game_id
      ORDER BY g.slug, s.release_date NULLS LAST, s.set_code
    `;

    for (const set of sets) {
      // Exclude special variant prints — they share a rarity label with regular
      // cards but are 100x rarer in real packs (One Piece Manga AA, Gold-Stamped,
      // Parallel, etc.). Including them inflates EV by orders of magnitude.
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
      if (cardRows.length === 0) continue;

      const cardsByRarity = new Map<string, CardLite[]>();
      for (const r of cardRows) {
        const arr = cardsByRarity.get(r.rarity) ?? [];
        arr.push({ rarity: r.rarity, marketCents: r.current_market_cents! });
        cardsByRarity.set(r.rarity, arr);
      }

      const rateRows = await sql<{ slot_index: number; rarity: string; probability: string }[]>`
        SELECT slot_index, rarity, probability::text AS probability
        FROM pull_rate_templates
        WHERE set_id = ${set.id} AND pack_type = 'booster_pack'
      `;
      if (rateRows.length === 0) continue;

      const ratesBySlot = new Map<number, SlotRate[]>();
      for (const r of rateRows) {
        const arr = ratesBySlot.get(r.slot_index) ?? [];
        arr.push({ slotIndex: r.slot_index, rarity: r.rarity, probability: Number(r.probability) });
        ratesBySlot.set(r.slot_index, arr);
      }

      const setData: SetData = { cardsByRarity, ratesBySlot, cardsPerPack: 12 };

      const products = await sql<{ id: number; pack_count: number; current_market_cents: number | null }[]>`
        SELECT id, pack_count, current_market_cents
        FROM products
        WHERE set_id = ${set.id} AND pack_count IS NOT NULL
      `;

      let updated = 0;
      for (const p of products) {
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
        updated++;
      }

      if (updated > 0) summary.push({ game: set.game_slug, set: set.slug, productsUpdated: updated });
    }

    const totalProducts = summary.reduce((acc, s) => acc + s.productsUpdated, 0);
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - started,
      setsTouched: summary.length,
      productsUpdated: totalProducts,
      iterations: ITERATIONS,
    });
  } finally {
    await sql.end();
  }
}
