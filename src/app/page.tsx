export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-400 selection:text-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-20 sm:px-10">
        <header className="flex items-center gap-2 text-sm font-medium tracking-wide text-amber-400">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          PackMeta
        </header>

        <section className="mt-24 flex-1">
          <h1 className="text-balance text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Should you rip it?
          </h1>
          <p className="mt-6 max-w-2xl text-balance text-xl leading-relaxed text-zinc-400 sm:text-2xl">
            See the expected value of every TCG pack, box, and bundle.
            Updated daily. Cross-game leaderboard. No paywall.
          </p>

          <div className="mt-12 flex flex-wrap gap-3 text-sm">
            <Tag>Lorcana</Tag>
            <Tag>One Piece TCG</Tag>
            <Tag>Pokémon</Tag>
            <Tag muted>+ more soon</Tag>
          </div>

          <div className="mt-16 inline-flex items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900/60 px-5 py-3 text-sm text-zinc-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Building the data pipeline. Soft launch in ~3 weeks.
          </div>
        </section>

        <footer className="mt-24 border-t border-zinc-900 pt-8 text-xs text-zinc-500">
          <p className="max-w-2xl leading-relaxed">
            PackMeta calculates pack expected value using community-tracked
            pull rates and live secondary-market prices via JustTCG. EV is
            an average — your individual pack will vary. Not affiliated with
            Disney, Ravensburger, Bandai, The Pokémon Company, or any
            publisher.
          </p>
          <p className="mt-4 text-zinc-600">
            © 2026 PackMeta
          </p>
        </footer>
      </div>
    </main>
  );
}

function Tag({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={
        muted
          ? "rounded-full border border-zinc-800 px-3 py-1 text-zinc-500"
          : "rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-medium text-amber-300"
      }
    >
      {children}
    </span>
  );
}
