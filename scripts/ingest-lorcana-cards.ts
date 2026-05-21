import "dotenv/config";
import postgres from "postgres";

type Variant = {
  id: string;
  condition: string;
  printing: string;
  language: string;
  price: number;
  lastUpdated: number;
};

type Card = {
  id: string;
  name: string;
  set: string;
  number: string;
  rarity: string;
  tcgplayerId?: string;
  variants: Variant[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, apiKey: string): Promise<unknown> {
  const backoffs = [3000, 8000, 20000, 45000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < backoffs.length) {
      const wait = backoffs[attempt];
      console.log(`    rate limited, sleeping ${wait}ms (attempt ${attempt + 1})`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${url} → ${res.status} ${await res.text()}`);
  }
}

// Map our internal game slug → JustTCG's game ID
const JUSTTCG_GAME_IDS: Record<string, string> = {
  lorcana: "disney-lorcana",
  "one-piece": "one-piece-card-game",
  pokemon: "pokemon",
};

async function fetchAllCards(setId: string, justtcgGameId: string, apiKey: string): Promise<Card[]> {
  const all: Card[] = [];
  const limit = 20; // free-tier cap
  let offset = 0;
  while (true) {
    const url = `https://api.justtcg.com/v1/cards?game=${justtcgGameId}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}`;
    const body = (await fetchJson(url, apiKey)) as { data: Card[]; meta: { hasMore: boolean; total: number } };
    all.push(...body.data);
    if (!body.meta.hasMore) break;
    offset += limit;
    await sleep(6500); // free tier ~10 req/min → 6.5s pace + headroom
  }
  return all;
}

function pickCanonicalVariant(variants: Variant[]): Variant | undefined {
  // Prefer English / Near Mint / Normal-or-Holofoil. Fall back through that order.
  const english = variants.filter((v) => !v.language || v.language === "English");
  const pool = english.length ? english : variants;
  return (
    pool.find((v) => v.condition === "Near Mint" && v.printing === "Normal") ??
    pool.find((v) => v.condition === "Near Mint" && v.printing === "Holofoil") ??
    pool.find((v) => v.condition === "Near Mint") ??
    pool[0]
  );
}

async function main() {
  const dbUrl = process.env.DATABASE_URL_POOLED;
  const apiKey = process.env.JUSTTCG_API_KEY;
  if (!dbUrl) throw new Error("DATABASE_URL_POOLED not set");
  if (!apiKey) throw new Error("JUSTTCG_API_KEY not set");

  const sql = postgres(dbUrl, { prepare: false });

  const resume = process.argv.includes("--resume");
  const gameArgIdx = process.argv.indexOf("--game");
  const gameSlug = gameArgIdx >= 0 ? process.argv[gameArgIdx + 1] : "lorcana";
  const justtcgGameId = JUSTTCG_GAME_IDS[gameSlug];
  if (!justtcgGameId) throw new Error(`Unknown game slug "${gameSlug}". Known: ${Object.keys(JUSTTCG_GAME_IDS).join(", ")}`);
  console.log(`Game: ${gameSlug} (JustTCG: ${justtcgGameId})${resume ? " — resume mode" : ""}`);

  const ourSets = await sql<{ id: number; slug: string; set_code: string; justtcg_set_id: string }[]>`
    SELECT s.id, s.slug, s.set_code, s.justtcg_set_id
    FROM sets s JOIN games g ON g.id = s.game_id
    WHERE g.slug = ${gameSlug} AND s.justtcg_set_id IS NOT NULL
      AND (
        ${resume} = false
        OR NOT EXISTS (SELECT 1 FROM cards c WHERE c.set_id = s.id)
      )
    ORDER BY s.release_date NULLS LAST, s.set_code
  `;

  if (!resume) {
    console.log(`Wiping cards + prices for ${gameSlug} (CASCADE)...`);
    await sql`
      DELETE FROM cards
      WHERE set_id IN (SELECT id FROM sets WHERE game_id = (SELECT id FROM games WHERE slug = ${gameSlug}))
    `;
  } else {
    console.log(`Resume mode — processing ${ourSets.length} sets without cards yet.`);
  }

  let totalCards = 0;
  let totalPrices = 0;
  const startedAt = Date.now();

  for (const set of ourSets) {
    const cards = await fetchAllCards(set.justtcg_set_id, justtcgGameId, apiKey);

    let inserted = 0;
    let prices = 0;

    await sql.begin(async (tx) => {
      for (const c of cards) {
        const v = pickCanonicalVariant(c.variants);
        if (!v) continue;

        const variantLabel = (v.printing || "Default").trim() || "Default";
        const cardNumber = (c.number ?? "").toString().trim() || "N/A";
        const cents = Math.round(v.price * 100);
        const lastPriceAt = new Date(v.lastUpdated * 1000);
        const tcgpId = c.tcgplayerId ? Number(c.tcgplayerId) : null;

        const rows = await tx<{ id: number }[]>`
          INSERT INTO cards (
            set_id, card_number, name, rarity, variant,
            justtcg_card_id, justtcg_variant_id, tcgplayer_product_id,
            current_market_cents, last_price_at
          )
          VALUES (
            ${set.id}, ${cardNumber}, ${c.name}, ${c.rarity}, ${variantLabel},
            ${c.id}, ${v.id}, ${tcgpId},
            ${cents}, ${lastPriceAt}
          )
          ON CONFLICT (justtcg_card_id) DO NOTHING
          RETURNING id
        `;
        if (rows.length === 0) continue; // already loaded under another set

        await tx`
          INSERT INTO prices (card_id, source, market_cents)
          VALUES (${rows[0].id}, 'justtcg', ${cents})
        `;

        inserted++;
        prices++;
      }
    });

    console.log(`  ${set.set_code.padEnd(4)} ${set.slug.padEnd(24)} ${inserted.toString().padStart(3)} cards / ${prices} prices`);
    totalCards += inserted;
    totalPrices += prices;
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${secs}s. Total: ${totalCards} cards, ${totalPrices} price snapshots.`);

  const sample = await sql`
    SELECT s.set_code, c.name, c.rarity, c.variant, c.current_market_cents
    FROM cards c JOIN sets s ON s.id = c.set_id JOIN games g ON g.id = s.game_id
    WHERE g.slug = ${gameSlug}
    ORDER BY c.current_market_cents DESC NULLS LAST
    LIMIT 10
  `;
  console.log(`\nTop 10 most expensive ${gameSlug} cards:`);
  for (const r of sample) {
    const usd = r.current_market_cents != null ? `$${(r.current_market_cents / 100).toFixed(2)}` : "—";
    console.log(`  ${r.set_code.padEnd(4)} ${usd.padStart(10)}  ${r.rarity.padEnd(14)} ${r.name} (${r.variant})`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
