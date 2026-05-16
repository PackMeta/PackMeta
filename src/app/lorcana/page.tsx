import Link from "next/link";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const revalidate = 3600; // page can cache for 1 hour

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

async function loadSets(): Promise<SetRow[]> {
  const rows = await db.execute<SetRow>(sql`
    WITH lorcana AS (
      SELECT s.id, s.slug, s.set_code, s.name, s.release_date::text
      FROM sets s
      JOIN games g ON g.id = s.game_id
      WHERE g.slug = 'lorcana'
    ),
    top_card AS (
      SELECT DISTINCT ON (c.set_id) c.set_id, c.name, c.current_market_cents
      FROM cards c
      WHERE c.current_market_cents IS NOT NULL
      ORDER BY c.set_id, c.current_market_cents DESC
    ),
    best_product AS (
      SELECT DISTINCT ON (p.set_id) p.set_id, p.name, p.current_roi_pct
      FROM products p
      WHERE p.current_roi_pct IS NOT NULL
        AND p.product_type IN ('booster_pack', 'sleeved_booster_pack', 'booster_box', 'booster_case')
      ORDER BY p.set_id, p.current_roi_pct DESC
    ),
    card_counts AS (
      SELECT set_id, COUNT(*)::int AS card_count FROM cards GROUP BY set_id
    )
    SELECT
      l.slug, l.set_code, l.name, l.release_date,
      COALESCE(cc.card_count, 0) AS card_count,
      tc.name AS top_card_name, tc.current_market_cents AS top_card_cents,
      bp.name AS best_product_name, bp.current_roi_pct::float AS best_product_roi
    FROM lorcana l
    LEFT JOIN top_card tc ON tc.set_id = l.id
    LEFT JOIN best_product bp ON bp.set_id = l.id
    LEFT JOIN card_counts cc ON cc.set_id = l.id
    ORDER BY l.release_date DESC NULLS LAST
  `);
  return Array.from(rows);
}

export default async function LorcanaIndex() {
  const sets = await loadSets();
  const ripSets = sets.filter((s) => s.best_product_roi != null && s.best_product_roi > 0);
  const skipSets = sets.filter((s) => s.best_product_roi != null && s.best_product_roi <= 0);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-400 selection:text-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium tracking-wide text-amber-400 hover:text-amber-300">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          PackMeta
        </Link>

        <header className="mt-10">
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Disney Lorcana — Should you rip it?
          </h1>
          <p className="mt-4 max-w-3xl text-balance text-lg text-zinc-400">
            Pack expected value across every set, calculated from live market prices
            and community pull rates. {sets.reduce((acc, s) => acc + s.card_count, 0).toLocaleString()} cards tracked.
          </p>
        </header>

        {ripSets.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-medium uppercase tracking-widest text-emerald-400">Rip It · positive ROI</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ripSets.map((s) => <SetCard key={s.slug} set={s} verdict="rip" />)}
            </div>
          </section>
        )}

        {skipSets.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Hold · negative ROI at current prices</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {skipSets.map((s) => <SetCard key={s.slug} set={s} verdict="hold" />)}
            </div>
          </section>
        )}

        <p className="mt-16 text-xs text-zinc-600">
          EV is a 10,000-iteration Monte Carlo simulation. Your individual pack will vary.
          Pull rates: community polls (Sets 8-9) + generic baseline (others).
        </p>
      </div>
    </main>
  );
}

function SetCard({ set, verdict }: { set: SetRow; verdict: "rip" | "hold" }) {
  const ringColor = verdict === "rip" ? "ring-emerald-400/30 hover:ring-emerald-400/60" : "ring-zinc-800 hover:ring-zinc-700";
  const roi = set.best_product_roi;
  const roiColor = roi != null && roi > 0 ? "text-emerald-400" : "text-zinc-500";
  return (
    <Link
      href={`/lorcana/${set.slug}`}
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
