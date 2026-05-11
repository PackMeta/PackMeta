# PackMeta

**Should you rip it?**

Cross-game trading card pack expected-value calculator. Lorcana, One Piece, Pokémon and more — updated daily, ranked on a single leaderboard, no paywall.

🌐 [packmeta.app](https://packmeta.app) — soft launch in ~3 weeks.

---

## Stack

- [Next.js 15](https://nextjs.org) (App Router) + React 19
- TypeScript
- Tailwind CSS v4
- Postgres (Supabase) + Drizzle ORM
- Vercel hosting + Vercel Cron
- Data: [JustTCG](https://justtcg.com) (primary), [TCGCSV](https://tcgcsv.com) (backup), eBay Browse API (chase-card ground truth)

## Methodology

Monte Carlo simulation (10K iterations per product) over community-tracked pull rates and live secondary-market prices. Matches the methodology established by [TheExpectedValue.com](https://theexpectedvalue.com) for MTG. Full transparency on the `/about` page.

## Local Development

```bash
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run lint    # eslint
```

## Status

- ✅ Brand + domain
- ✅ Landing page
- 🔨 Data pipeline (in progress)
- 🔨 Per-set EV pages
- 🔨 Cross-game leaderboard
- 📅 Soft launch target: ~3 weeks

## License

Not affiliated with Disney, Ravensburger, Bandai, The Pokémon Company, or any publisher. All trademarks belong to their respective owners.

© 2026 PackMeta
