import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const revalidate = 3600;

type Hot = {
  set_slug: string;
  set_code: string;
  set_name: string;
  game_slug: string;
  product_name: string;
  product_type: string;
  pack_count: number | null;
  market_cents: number;
  ev_cents: number;
  roi_pct: number;
};

async function loadHotProducts(): Promise<Hot[]> {
  const rows = await db.execute<Hot>(sql`
    SELECT
      s.slug AS set_slug, s.set_code, s.name AS set_name,
      g.slug AS game_slug,
      p.name AS product_name, p.product_type, p.pack_count,
      p.current_market_cents AS market_cents,
      p.current_ev_cents AS ev_cents,
      p.current_roi_pct::float AS roi_pct
    FROM products p
    JOIN sets s ON s.id = p.set_id
    JOIN games g ON g.id = s.game_id
    WHERE p.current_roi_pct IS NOT NULL
      AND p.current_market_cents IS NOT NULL
      AND p.current_market_cents > 1000  /* > $10 — filter mispriced micro-products */
      AND p.current_roi_pct BETWEEN 0 AND 100  /* cap to filter stale/outlier prices */
      AND p.product_type IN ('booster_pack', 'sleeved_booster_pack', 'booster_box', 'booster_case', 'trove')
    ORDER BY p.current_roi_pct DESC
    LIMIT 8
  `);
  return Array.from(rows);
}

export default async function Home() {
  const hot = await loadHotProducts();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-400 selection:text-zinc-950">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
        <header className="flex items-center gap-2 text-sm font-medium tracking-wide text-amber-400">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          PackMeta
        </header>

        <section className="mt-16">
          <h1 className="text-balance text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Should you rip it?
          </h1>
          <p className="mt-6 max-w-2xl text-balance text-xl leading-relaxed text-zinc-400 sm:text-2xl">
            See the expected value of every TCG pack, box, and bundle. Cross-game
            leaderboard. Live prices. No paywall.
          </p>

          <div className="mt-10 flex flex-wrap gap-3 text-sm">
            <Tag href="/lorcana">Lorcana</Tag>
            <Tag href="/one-piece">One Piece</Tag>
            <Tag muted>Pokémon — soon</Tag>
          </div>
        </section>

        {hot.length > 0 && (
          <section className="mt-20">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-widest text-emerald-400">
                Hot Right Now · positive ROI products
              </h2>
              <span className="text-xs text-zinc-600">updated hourly</span>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 text-right font-medium">Pay</th>
                    <th className="px-4 py-3 text-right font-medium">EV</th>
                    <th className="px-4 py-3 text-right font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {hot.map((h, i) => (
                    <tr key={`${h.set_slug}-${h.product_name}`} className="bg-zinc-950 hover:bg-zinc-900/40">
                      <td className="px-4 py-3 font-mono text-zinc-500">{i + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={`/${h.game_slug}/${h.set_slug}`} className="font-medium text-zinc-100 hover:text-amber-300">
                          {h.product_name}
                        </Link>
                        <div className="text-xs text-zinc-500">
                          {h.set_name} · {h.product_type}{h.pack_count ? ` · ${h.pack_count} packs` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">${(h.market_cents / 100).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono">${(h.ev_cents / 100).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-emerald-400">
                        +{h.roi_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-zinc-600">
              ROI = (expected card value − product price) / product price. EV from 10k-iteration Monte Carlo.
            </p>
          </section>
        )}

        <footer className="mt-24 border-t border-zinc-900 pt-8 text-xs text-zinc-500">
          <p className="max-w-2xl leading-relaxed">
            PackMeta calculates pack expected value using community-tracked
            pull rates and live secondary-market prices via JustTCG. EV is
            an average — your individual pack will vary.{" "}
            <Link href="/methodology" className="text-zinc-400 underline hover:text-zinc-200">
              Read the methodology
            </Link>
            . Not affiliated with Disney, Ravensburger, Bandai, The Pokémon Company, or any publisher.
          </p>
          <p className="mt-4 text-zinc-600">© 2026 PackMeta</p>
        </footer>
      </div>
    </main>
  );
}

function Tag({
  children,
  muted = false,
  href,
}: {
  children: React.ReactNode;
  muted?: boolean;
  href?: string;
}) {
  const className = muted
    ? "rounded-full border border-zinc-800 px-3 py-1 text-zinc-500"
    : "rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-medium text-amber-300";
  if (href) {
    return (
      <a href={href} className={`${className} transition hover:bg-amber-400/20`}>
        {children}
      </a>
    );
  }
  return <span className={className}>{children}</span>;
}
