import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getGame } from "@/lib/games";

export const revalidate = 3600;

type SetRow = {
  slug: string;
  set_code: string;
  name: string;
  release_date: string | null;
  card_count: number;
  top_card_name: string | null;
  top_card_cents: number | null;
  best_product_name: string | null;
  best_product_roi: number | null;
};

async function loadSets(gameSlug: string): Promise<SetRow[]> {
  const rows = await db.execute<SetRow>(sql`
    WITH game_sets AS (
      SELECT s.id, s.slug, s.set_code, s.name, s.release_date::text
      FROM sets s
      JOIN games g ON g.id = s.game_id
      WHERE g.slug = ${gameSlug}
    ),
    top_card AS (
      SELECT DISTINCT ON (c.set_id) c.set_id, c.name, c.current_market_cents
      FROM cards c
      WHERE c.current_market_cents IS NOT NULL
        AND c.set_id IN (SELECT id FROM game_sets)
      ORDER BY c.set_id, c.current_market_cents DESC
    ),
    best_product AS (
      SELECT DISTINCT ON (p.set_id) p.set_id, p.name, p.current_roi_pct
      FROM products p
      WHERE p.current_roi_pct IS NOT NULL
        AND p.current_roi_pct <= 100
        AND p.set_id IN (SELECT id FROM game_sets)
        AND p.product_type IN ('booster_pack', 'sleeved_booster_pack', 'booster_box', 'booster_case')
      ORDER BY p.set_id, p.current_roi_pct DESC
    ),
    card_counts AS (
      SELECT set_id, COUNT(*)::int AS card_count
      FROM cards
      WHERE set_id IN (SELECT id FROM game_sets)
      GROUP BY set_id
    )
    SELECT
      gs.slug, gs.set_code, gs.name, gs.release_date,
      COALESCE(cc.card_count, 0) AS card_count,
      tc.name AS top_card_name, tc.current_market_cents AS top_card_cents,
      bp.name AS best_product_name, bp.current_roi_pct::float AS best_product_roi
    FROM game_sets gs
    LEFT JOIN top_card tc ON tc.set_id = gs.id
    LEFT JOIN best_product bp ON bp.set_id = gs.id
    LEFT JOIN card_counts cc ON cc.set_id = gs.id
    ORDER BY gs.release_date DESC NULLS LAST
  `);
  return Array.from(rows);
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const meta = getGame(game);
  if (!meta) return { title: "Game not found" };
  return {
    title: `${meta.fullName} — Pack EV`,
    description: `Should you rip ${meta.fullName}? Live pack expected value, top chase cards, and product ROI from real market data.`,
  };
}

export default async function GameIndex({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const meta = getGame(game);
  if (!meta) notFound();

  const sets = await loadSets(game);
  const ripSets = sets.filter((s) => s.best_product_roi != null && s.best_product_roi > 0);
  const skipSets = sets.filter((s) => s.best_product_roi != null && s.best_product_roi <= 0);
  const totalCards = sets.reduce((acc, s) => acc + s.card_count, 0);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-400 selection:text-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium tracking-wide text-amber-400 hover:text-amber-300">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          PackMeta
        </Link>

        <header className="mt-10">
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {meta.fullName} — Should you rip it?
          </h1>
          <p className="mt-4 max-w-3xl text-balance text-lg text-zinc-400">
            {meta.blurb} {totalCards.toLocaleString()} cards tracked.
          </p>
        </header>

        {ripSets.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-medium uppercase tracking-widest text-emerald-400">Rip It · positive ROI</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ripSets.map((s) => <SetCard key={s.slug} set={s} game={game} verdict="rip" />)}
            </div>
          </section>
        )}

        {skipSets.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Hold · negative ROI at current prices</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {skipSets.map((s) => <SetCard key={s.slug} set={s} game={game} verdict="hold" />)}
            </div>
          </section>
        )}

        {ripSets.length === 0 && skipSets.length === 0 && (
          <p className="mt-12 text-zinc-500">No sets loaded yet for {meta.name}. Check back soon.</p>
        )}

        <p className="mt-16 text-xs text-zinc-600">
          EV is a 10,000-iteration Monte Carlo simulation. Your individual pack will vary.
        </p>
      </div>
    </main>
  );
}

function SetCard({ set, game, verdict }: { set: SetRow; game: string; verdict: "rip" | "hold" }) {
  const ringColor = verdict === "rip" ? "ring-emerald-400/30 hover:ring-emerald-400/60" : "ring-zinc-800 hover:ring-zinc-700";
  const roi = set.best_product_roi;
  const roiColor = roi != null && roi > 0 ? "text-emerald-400" : "text-zinc-500";
  return (
    <Link
      href={`/${game}/${set.slug}`}
      className={`group block rounded-xl bg-zinc-900/60 p-5 ring-1 transition ${ringColor}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-500">{set.set_code}</span>
        {set.release_date && (
          <span className="text-xs text-zinc-500">{set.release_date.slice(0, 7)}</span>
        )}
      </div>
      <h3 className="mt-2 text-xl font-semibold tracking-tight">{set.name}</h3>
      <p className="mt-1 text-xs text-zinc-500">{set.card_count} cards</p>

      {set.top_card_name && set.top_card_cents != null && (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Top chase</p>
          <p className="mt-1 truncate text-sm text-zinc-200">{set.top_card_name}</p>
          <p className="text-sm font-mono text-amber-400">${(set.top_card_cents / 100).toFixed(2)}</p>
        </div>
      )}

      {roi != null && (
        <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
          <span className="text-xs text-zinc-500">Best product ROI</span>
          <span className={`font-mono text-sm font-medium ${roiColor}`}>
            {roi > 0 ? "+" : ""}{roi.toFixed(1)}%
          </span>
        </div>
      )}
    </Link>
  );
}
