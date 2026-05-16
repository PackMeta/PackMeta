import "dotenv/config";
import postgres from "postgres";

// JustTCG returns sealed items mixed into /cards. After ingest, this script
// reclassifies them into `products` and removes them from `cards`.
// Heuristic: any row in `cards` with rarity = 'None' is a sealed product.

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function classifyProductType(name: string): {
  type: string;
  packCount: number | null;
  cardsPerPack: number | null;
} {
  const n = name.toLowerCase();
  // Order matters — case before box before sleeved-booster-pack before pack
  if (n.includes("case")) return { type: "booster_case", packCount: 96, cardsPerPack: 12 };
  if (n.includes("illumineer's trove") || n.includes("trove")) return { type: "trove", packCount: 8, cardsPerPack: 12 };
  if (n.includes("starter deck display")) return { type: "starter_display", packCount: null, cardsPerPack: null };
  if (n.includes("starter deck")) return { type: "starter_deck", packCount: null, cardsPerPack: 60 };
  if (n.includes("gift set")) return { type: "gift_set", packCount: null, cardsPerPack: null };
  if (n.includes("booster box")) return { type: "booster_box", packCount: 24, cardsPerPack: 12 };
  if (n.includes("sleeved booster pack")) return { type: "sleeved_booster_pack", packCount: 1, cardsPerPack: 12 };
  if (n.includes("booster pack")) return { type: "booster_pack", packCount: 1, cardsPerPack: 12 };
  return { type: "other", packCount: null, cardsPerPack: null };
}

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  const sealed = await sql<
    {
      id: number;
      set_id: number;
      name: string;
      justtcg_card_id: string | null;
      tcgplayer_product_id: number | null;
      current_market_cents: number | null;
      last_price_at: Date | null;
    }[]
  >`
    SELECT id, set_id, name, justtcg_card_id, tcgplayer_product_id, current_market_cents, last_price_at
    FROM cards
    WHERE rarity = 'None'
    ORDER BY set_id, current_market_cents DESC NULLS LAST
  `;

  console.log(`Found ${sealed.length} sealed rows in cards table.`);

  let movedCount = 0;
  const seenSlugs = new Map<number, Set<string>>();

  await sql.begin(async (tx) => {
    for (const row of sealed) {
      const cls = classifyProductType(row.name);
      let slug = slugify(row.name.replace(/^disney lorcana:?\s*/i, ""));
      if (!slug) slug = `product-${row.id}`;

      const setSeen = seenSlugs.get(row.set_id) ?? new Set<string>();
      let finalSlug = slug;
      let i = 2;
      while (setSeen.has(finalSlug)) {
        finalSlug = `${slug}-${i++}`;
      }
      setSeen.add(finalSlug);
      seenSlugs.set(row.set_id, setSeen);

      await tx`
        INSERT INTO products (
          set_id, slug, name, product_type, pack_count, cards_per_pack,
          justtcg_product_id, tcgplayer_product_id, current_market_cents, last_calculated_at
        )
        VALUES (
          ${row.set_id}, ${finalSlug}, ${row.name}, ${cls.type}, ${cls.packCount}, ${cls.cardsPerPack},
          ${row.justtcg_card_id}, ${row.tcgplayer_product_id}, ${row.current_market_cents}, ${row.last_price_at}
        )
        ON CONFLICT (set_id, slug) DO UPDATE SET
          name = EXCLUDED.name,
          product_type = EXCLUDED.product_type,
          current_market_cents = EXCLUDED.current_market_cents,
          last_calculated_at = EXCLUDED.last_calculated_at
      `;

      await tx`DELETE FROM cards WHERE id = ${row.id}`;
      movedCount++;
    }
  });

  console.log(`Moved ${movedCount} sealed rows from cards → products.`);

  console.log(`\nProducts by type:`);
  const summary = await sql`
    SELECT product_type, COUNT(*)::int AS n, ROUND(AVG(current_market_cents)/100.0, 2) AS avg_usd
    FROM products
    GROUP BY product_type
    ORDER BY n DESC
  `;
  for (const r of summary) console.log(`  ${r.product_type.padEnd(22)} ${r.n.toString().padStart(4)} (avg $${r.avg_usd})`);

  console.log(`\nTop priced products:`);
  const top = await sql`
    SELECT s.set_code, p.product_type, p.name, p.current_market_cents
    FROM products p JOIN sets s ON s.id = p.set_id
    WHERE p.current_market_cents IS NOT NULL
    ORDER BY p.current_market_cents DESC
    LIMIT 10
  `;
  for (const r of top) {
    const usd = `$${(r.current_market_cents / 100).toFixed(2)}`;
    console.log(`  ${r.set_code.padEnd(4)} ${usd.padStart(9)}  ${r.product_type.padEnd(22)} ${r.name}`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
