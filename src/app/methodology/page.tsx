import Link from "next/link";

export const metadata = {
  title: "Methodology",
  description:
    "How PackMeta calculates expected value: data sources, Monte Carlo simulation, pull-rate transparency, and known limitations.",
};

export default function Methodology() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-400 selection:text-zinc-950">
      <article className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-amber-400 hover:text-amber-300">PackMeta</Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-200">Methodology</span>
        </div>

        <header className="mt-10">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            How we calculate &ldquo;Should you rip it?&rdquo;
          </h1>
          <p className="mt-4 text-balance text-lg text-zinc-400">
            Honest, transparent math. No paywall, no upsell, no affiliate manipulation of the numbers.
          </p>
        </header>

        <Section title="The math in one sentence">
          <p>
            For every booster product, we simulate <strong>10,000 random packs</strong> using
            community-tracked pull rates and price each pulled card at its live secondary-market
            value. The mean of those 10,000 outcomes is the <em>expected value</em> (EV).
            We compare EV to the product&apos;s current market price — if EV exceeds price,
            the math says <span className="text-emerald-400 font-medium">rip it</span>.
          </p>
        </Section>

        <Section title="Data sources">
          <ul className="space-y-2">
            <li>
              <strong>Card prices &amp; sealed-product prices:</strong>{" "}
              <a className="text-amber-400 hover:text-amber-300 underline" href="https://justtcg.com" target="_blank" rel="noreferrer">JustTCG</a> —
              live secondary-market data sourced from TCGPlayer, updated multiple times per day.
              We use Near Mint English prices as the canonical value, falling back to the next-best
              variant if Near Mint isn&apos;t available.
            </li>
            <li>
              <strong>Pull rates:</strong> Per-set community polls and publisher-published rates
              where available. For Lorcana, we use{" "}
              <a className="text-amber-400 hover:text-amber-300 underline" href="https://reddit.com/r/Lorcana" target="_blank" rel="noreferrer">r/Lorcana</a>{" "}
              community polls (most recent: u/Narzghal n=700+ for Set 9 Fabled, n=479 for Set 8
              Reign of Jafar). For sets without a community poll, we use a generic baseline derived
              from average rates across the game. For One Piece, we use{" "}
              <a className="text-amber-400 hover:text-amber-300 underline" href="https://reddit.com/r/OnePieceTCGFinance" target="_blank" rel="noreferrer">r/OnePieceTCGFinance</a>{" "}
              tracking and Bandai-published rates.
            </li>
            <li>
              <strong>Pack composition:</strong> Manufacturer-confirmed (12 cards/pack for Lorcana
              and One Piece; 10/pack for modern Pokémon).
            </li>
          </ul>
        </Section>

        <Section title="Why Monte Carlo, not a formula?">
          <p>
            The closed-form &ldquo;average pack value&rdquo; formula (Central Limit Theorem) is
            faster, but produces unrealistic tail estimates — it can predict outcomes below $0 or
            wildly above realistic ceilings. Monte Carlo simulation re-draws actual random packs
            from the rarity distribution, which respects natural bounds and gives much tighter,
            more believable confidence bands.
          </p>
          <p className="mt-3">
            This matches the methodology used by{" "}
            <a className="text-amber-400 hover:text-amber-300 underline" href="https://theexpectedvalue.com" target="_blank" rel="noreferrer">TheExpectedValue.com</a>,
            the established MTG/Pokémon EV calculator.
          </p>
        </Section>

        <Section title="What EV is not">
          <p>
            EV is the <strong>mean</strong> outcome across 10,000 simulated packs — that is,
            the long-run average if you ripped a huge number of packs. <em>Your individual pack
            will vary widely.</em>
          </p>
          <p className="mt-3">
            Most Lorcana packs return $1–$3 in market value. A small fraction return $100+ because
            of a single Enchanted or Iconic pull. The mean is pulled up by those rare high-value
            pulls. EV does not promise you a $50 pack; it tells you whether the math favors the
            ripper across many packs.
          </p>
          <p className="mt-3">
            We&apos;ll surface confidence bands (p25/p50/p75) on individual product pages soon so
            you can see the full distribution, not just the mean.
          </p>
        </Section>

        <Section title="Known limitations (we&apos;re honest about these)">
          <ul className="space-y-3">
            <li>
              <strong>Foil printing approximation:</strong> Our card pool stores one canonical
              price per card (typically Near Mint Normal). The foil slot in a Lorcana pack actually
              draws a Holofoil variant, which can have a different price for non-chase rarities.
              The pricing impact at the Common/Uncommon level is small (cents); the chase rarities
              (Enchanted, Iconic, Epic) only exist as foils and are correctly priced.
            </li>
            <li>
              <strong>Pull rates are estimates:</strong> Where community polls exist, sample sizes
              are 400–700+ packs — large enough for high-confidence rare/super-rare rates, but
              chase-tier rates (Enchanted ~1/96, Iconic ~1/125) have wider confidence intervals.
              Newer rarities (Iconic, Epic, introduced in Fabled) have placeholder rates we&apos;ll
              refine as more community data lands.
            </li>
            <li>
              <strong>Stale or anomalous prices:</strong> JustTCG occasionally has sparse data on
              low-volume sealed products (small reprints, obscure SKUs). When a sealed product&apos;s
              listed price looks orders of magnitude off from realistic market, our headline
              leaderboard caps the displayed ROI at +100% to avoid misleading numbers — but the
              detail page shows the raw calc anyway.
            </li>
            <li>
              <strong>Snapshot, not real-time:</strong> Card prices refresh on JustTCG every few
              hours. Our EV recalculation runs once a day. The dashboard timestamps the last calc
              on each product so you can see how fresh the math is.
            </li>
            <li>
              <strong>Market price ≠ retail price:</strong> Sealed product prices on TCGPlayer
              reflect the resale market, not what your LGS or big-box store charges. A pack
              listed at $4 on TCGPlayer might be $5 at retail — meaning sometimes &ldquo;hold&rdquo;
              packs are actually rip-it at MSRP. Compare against your local price.
            </li>
          </ul>
        </Section>

        <Section title="Affiliate disclosure">
          <p>
            PackMeta may earn a commission when you click through to TCGPlayer to buy a product
            — currently 3.5%. The affiliate link only appears on product pages; it does <em>not</em>{" "}
            influence the EV math, the ranking on the leaderboard, or the verdict we display.
            We profit when you click, regardless of whether you rip or hold.
          </p>
        </Section>

        <Section title="Not affiliated with any publisher">
          <p>
            PackMeta is an independent project. It is not affiliated with, endorsed by, or
            sponsored by Disney, Ravensburger, Bandai, The Pokémon Company, or any other
            trading-card publisher. All trademarks belong to their respective owners.
          </p>
        </Section>

        <p className="mt-16 text-sm text-zinc-500">
          Questions, corrections, or data you think we&apos;ve gotten wrong? Open an issue on{" "}
          <a className="text-amber-400 hover:text-amber-300 underline" href="https://github.com/PackMeta/PackMeta" target="_blank" rel="noreferrer">our GitHub</a>.
        </p>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-100">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}
