import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getGame } from "@/lib/games";
import { tcgplayerProductUrl } from "@/lib/tcgplayer";

export const revalidate = 3600;

type SetMeta = {
  id: number;
  slug: string;
  set_code: string;
  name: string;
  release_date: string | null;
  card_count: number;
};

type ChaseCardRow = {
  name: string;
  rarity: string;
  variant: string | null;
  card_number: string;
  current_market_cents: number;
  tcgplayer_product_id: number | null;
};

type CardRow = ChaseCardRow & {
  expected_pulls_per_pack: number;
};

type ProductRow = {
  slug: string;
  name: string;
  product_type: string;
  pack_count: number | null;
  current_market_cents: number | null;
  current_ev_cents: number | null;
  current_roi_pct: number | null;
  tcgplayer_product_id: number | null;
};

async function loadSet(gameSlug: string, slug: string): Promise<{ set: SetMeta; chaseCards: ChaseCardRow[]; cards: CardRow[]; products: ProductRow[] } | null> {
  const setRows = await db.execute<SetMeta & { card_count: number }>(sql`
    SELECT s.id, s.slug, s.set_code, s.name, s.release_date::text,
           (SELECT COUNT(*)::int FROM cards WHERE set_id = s.id) AS card_count
    FROM sets s JOIN games g ON g.id = s.game_id
    WHERE g.slug = ${gameSlug} AND s.slug = ${slug}
  `);
  const set = setRows[0];
  if (!set) return null;

  // Top value drivers: per-card expected EV contribution to a single booster pack.
  // Math: expected_pulls_per_pack = (sum of slot probabilities that roll this rarity)
  //                                  ÷ (cards of that rarity in the set).
  // Sorted by ev contribution per pack = expected_pulls_per_pack × price.
  // Same dedup + set-code-leakage filter as before.
  const cards = await db.execute<CardRow>(sql`
    WITH dedup AS (
      SELECT DISTINCT ON (card_number)
        name, rarity, variant, card_number, current_market_cents, tcgplayer_product_id
      FROM cards
      WHERE set_id = ${set.id}
        AND current_market_cents IS NOT NULL
        AND (
          ${set.set_code}::text IS NULL
          OR card_number NOT LIKE '%-%'
          OR card_number ILIKE ${set.set_code} || '-%'
        )
      ORDER BY card_number, current_market_cents DESC
    ),
    rarity_pool AS (
      SELECT rarity, COUNT(*)::float AS pool_size FROM dedup GROUP BY rarity
    ),
    slot_totals AS (
      SELECT rarity, SUM(probability)::float AS pulls_per_pack_rarity
      FROM pull_rate_templates
      WHERE set_id = ${set.id} AND pack_type = 'booster_pack'
      GROUP BY rarity
    )
    SELECT
      d.name, d.rarity, d.variant, d.card_number,
      d.current_market_cents, d.tcgplayer_product_id,
      COALESCE(st.pulls_per_pack_rarity / NULLIF(rp.pool_size, 0), 0)::float AS expected_pulls_per_pack
    FROM dedup d
    LEFT JOIN rarity_pool rp ON rp.rarity = d.rarity
    LEFT JOIN slot_totals st ON st.rarity = d.rarity
    ORDER BY
      (COALESCE(st.pulls_per_pack_rarity / NULLIF(rp.pool_size, 0), 0) * d.current_market_cents) DESC NULLS LAST,
      d.current_market_cents DESC
    LIMIT 12
  `);

  // Chase cards: the moonshot framing — raw highest market price, no EV weighting.
  // Same dedup + leakage filter. Pulls 12; the page slices to 6 when also rendering
  // the value drivers section, falls back to the full 12 when EV data is missing.
  const chaseCards = await db.execute<ChaseCardRow>(sql`
    SELECT * FROM (
      SELECT DISTINCT ON (card_number)
        name, rarity, variant, card_number, current_market_cents, tcgplayer_product_id
      FROM cards
      WHERE set_id = ${set.id}
        AND current_market_cents IS NOT NULL
        AND (
          ${set.set_code}::text IS NULL
          OR card_number NOT LIKE '%-%'
          OR card_number ILIKE ${set.set_code} || '-%'
        )
      ORDER BY card_number, current_market_cents DESC
    ) dedup
    ORDER BY current_market_cents DESC
    LIMIT 12
  `);

  const products = await db.execute<ProductRow>(sql`
    SELECT slug, name, product_type, pack_count, current_market_cents, current_ev_cents,
           current_roi_pct::float AS current_roi_pct, tcgplayer_product_id
    FROM products
    WHERE set_id = ${set.id}
    ORDER BY
      CASE WHEN current_roi_pct IS NULL THEN 1 ELSE 0 END,
      current_roi_pct DESC NULLS LAST,
      pack_count NULLS LAST
  `);

  return { set, chaseCards: Array.from(chaseCards), cards: Array.from(cards), products: Array.from(products) };
}

export async function generateMetadata({ params }: { params: Promise<{ game: string; slug: string }> }) {
  const { game, slug } = await params;
  const meta = getGame(game);
  if (!meta) return { title: "Set not found" };
  const data = await loadSet(game, slug);
  if (!data) return { title: "Set not found" };
  return {
    title: `${meta.name} ${data.set.name} — Pack EV`,
    description: `Should you rip ${meta.fullName} ${data.set.name}? Live pack expected value, top chase cards, and box ROI from market data.`,
  };
}

export default async function SetPage({ params }: { params: Promise<{ game: string; slug: string }> }) {
  const { game, slug } = await params;
  const meta = getGame(game);
  if (!meta) notFound();
  const data = await loadSet(game, slug);
  if (!data) notFound();

  const { set, chaseCards, cards, products } = data;
  // Pick a credible "best deal" — positive ROI, but not a clearly stale/mispriced outlier.
  // Anything >100% is almost always a low-volume product with a wrong sticker price.
  const bestProduct = products.find((p) => p.current_roi_pct != null && p.current_roi_pct > 0 && p.current_roi_pct <= 100);
  const ripIt = bestProduct != null;

  // Anchor the "per box" framing to the dominant booster box in this set.
  const boxSizes = products
    .filter((p) => p.product_type === "booster_box" && p.pack_count != null)
    .map((p) => p.pack_count as number);
  const boxPackCount: number | null = boxSizes.length > 0 ? Math.max(...boxSizes) : null;
  const hasEvData = boxPackCount != null && cards.some((c) => c.expected_pulls_per_pack > 0);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "PackMeta", item: "https://packmeta.app" },
      { "@type": "ListItem", position: 2, name: meta.fullName, item: `https://packmeta.app/${game}` },
      { "@type": "ListItem", position: 3, name: set.name, item: `https://packmeta.app/${game}/${set.slug}` },
    ],
  };
  const pageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${meta.name} ${set.name} — Pack EV`,
    description: `Should you rip ${meta.fullName} ${set.name}? Verdict: ${ripIt ? "Rip it" : "Hold"}. Live pack expected value, top chase cards, and product ROI from market data.`,
    url: `https://packmeta.app/${game}/${set.slug}`,
    isPartOf: { "@type": "WebSite", name: "PackMeta", url: "https://packmeta.app" },
    about: { "@type": "Thing", name: `${meta.fullName} ${set.name}` },
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-400 selection:text-zinc-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd) }} />
      <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-amber-400 hover:text-amber-300">PackMeta</Link>
          <span className="text-zinc-700">/</span>
          <Link href={`/${game}`} className="text-zinc-400 hover:text-zinc-200">{meta.name}</Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-200">{set.name}</span>
        </div>

        <header className="mt-8">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-zinc-500">{set.set_code}</span>
            {set.release_date && (
              <span className="text-sm text-zinc-500">{set.release_date}</span>
            )}
            <span className="text-sm text-zinc-500">· {set.card_count} cards</span>
          </div>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {set.name}
          </h1>
        </header>

        <section className="mt-10">
          {ripIt ? (
            <div className="rounded-2xl bg-emerald-400/10 p-6 ring-1 ring-emerald-400/30">
              <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">Verdict</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">Rip it.</p>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Best deal right now: <span className="font-medium text-emerald-300">{bestProduct!.name}</span>.{" "}
                Market <span className="font-mono">${((bestProduct!.current_market_cents ?? 0) / 100).toFixed(2)}</span>,
                expected value <span className="font-mono">${((bestProduct!.current_ev_cents ?? 0) / 100).toFixed(2)}</span> —
                that&apos;s <span className="font-semibold text-emerald-300">+{bestProduct!.current_roi_pct!.toFixed(1)}% ROI</span> on average.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-zinc-900/60 p-6 ring-1 ring-zinc-800">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Verdict</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">Hold.</p>
              <p className="mt-3 max-w-2xl text-zinc-400">
                No sealed product for {set.name} currently trades below its expected card value.
                Collectors are paying a premium over the math. Wait for prices to drop or chase singles instead.
              </p>
            </div>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Sealed products</h2>
          <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 text-right font-medium">Packs</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">EV</th>
                  <th className="px-4 py-3 text-right font-medium">ROI</th>
                  <th className="px-4 py-3 text-right font-medium">Buy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {products.map((p) => {
                  const roi = p.current_roi_pct;
                  const positive = roi != null && roi > 0;
                  const buyUrl = tcgplayerProductUrl(p.tcgplayer_product_id);
                  return (
                    <tr key={p.slug} className="bg-zinc-950 hover:bg-zinc-900/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-100">{p.name}</div>
                        <div className="text-xs text-zinc-500">{p.product_type}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-400">{p.pack_count ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {p.current_market_cents != null ? `$${(p.current_market_cents / 100).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {p.current_ev_cents != null ? `$${(p.current_ev_cents / 100).toFixed(2)}` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${positive ? "text-emerald-400" : "text-zinc-500"}`}>
                        {roi != null ? `${roi > 0 ? "+" : ""}${roi.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {buyUrl ? (
                          <a
                            href={buyUrl}
                            target="_blank"
                            rel="sponsored noopener"
                            className="inline-flex items-center rounded-md bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30 transition hover:bg-amber-400/20 hover:text-amber-200"
                          >
                            Buy ↗
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-700">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Buy links go to TCGPlayer. We earn a small commission on purchases — costs you nothing extra and keeps the lights on.
          </p>
        </section>

        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Top chase cards</h2>
            <p className="text-xs text-zinc-600">The moonshots — what gets the hype</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(hasEvData ? chaseCards.slice(0, 6) : chaseCards).map((c) => {
              const buyUrl = tcgplayerProductUrl(c.tcgplayer_product_id);
              const inner = (
                <>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-100">{c.name}</div>
                    <div className="text-xs text-zinc-500">
                      {c.rarity}
                      {c.variant && c.variant !== "Normal" ? ` · ${c.variant}` : ""}
                      {" · "}#{c.card_number}
                    </div>
                  </div>
                  <div className="ml-3 shrink-0 font-mono text-amber-400">${(c.current_market_cents / 100).toFixed(2)}</div>
                </>
              );
              return buyUrl ? (
                <a
                  key={"chase-" + c.card_number + c.name}
                  href={buyUrl}
                  target="_blank"
                  rel="sponsored noopener"
                  className="flex items-baseline justify-between rounded-lg bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800 transition hover:bg-zinc-900 hover:ring-amber-400/40"
                >
                  {inner}
                </a>
              ) : (
                <div
                  key={"chase-" + c.card_number + c.name}
                  className="flex items-baseline justify-between rounded-lg bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </section>

        {hasEvData && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Top value drivers</h2>
            <p className="text-xs text-zinc-600">
              Ranked by expected $ contribution to a {boxPackCount}-pack booster box
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {cards.map((c) => {
              const buyUrl = tcgplayerProductUrl(c.tcgplayer_product_id);
              const pullsPerBox = hasEvData ? c.expected_pulls_per_pack * boxPackCount! : 0;
              const evPerBoxCents = Math.round(pullsPerBox * c.current_market_cents);
              const showEv = hasEvData && pullsPerBox > 0;
              const pullsLabel = pullsPerBox >= 1
                ? `~${pullsPerBox.toFixed(1)} per box`
                : `1 in ${(1 / pullsPerBox).toFixed(pullsPerBox < 0.05 ? 0 : 1)} boxes`;
              const inner = (
                <>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-100">{c.name}</div>
                    <div className="text-xs text-zinc-500">
                      {c.rarity}
                      {c.variant && c.variant !== "Normal" ? ` · ${c.variant}` : ""}
                      {" · "}#{c.card_number}
                    </div>
                    {showEv && (
                      <div className="mt-1 text-xs text-emerald-400/80">
                        {pullsLabel} · ${(evPerBoxCents / 100).toFixed(2)} box EV
                      </div>
                    )}
                  </div>
                  <div className="ml-3 shrink-0 font-mono text-amber-400">${(c.current_market_cents / 100).toFixed(2)}</div>
                </>
              );
              return buyUrl ? (
                <a
                  key={c.card_number + c.name}
                  href={buyUrl}
                  target="_blank"
                  rel="sponsored noopener"
                  className="flex items-baseline justify-between rounded-lg bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800 transition hover:bg-zinc-900 hover:ring-amber-400/40"
                >
                  {inner}
                </a>
              ) : (
                <div
                  key={c.card_number + c.name}
                  className="flex items-baseline justify-between rounded-lg bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
        )}

        <p className="mt-16 text-xs text-zinc-600">
          EV is a 10,000-iteration Monte Carlo simulation — the *average* outcome across many packs.
          Your individual pack will vary widely; most packs return $1–3 with rare high-value pulls swinging the mean.
          Prices via JustTCG, updated periodically.
        </p>
      </div>
    </main>
  );
}
