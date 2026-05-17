import "dotenv/config";
import postgres from "postgres";

// Curated subset of One Piece main booster + chase-relevant special sets.
// Skips: starter decks, pre-release event cards, demo decks, revision packs.
// We may expand to all 16 main sets after free-tier quota allows.
const MAIN_SETS = [
  { code: "OP01", slug: "romance-dawn",              name: "Romance Dawn",              justtcgId: "romance-dawn-one-piece-card-game",              release: "2022-12-02" },
  { code: "OP02", slug: "paramount-war",             name: "Paramount War",             justtcgId: "paramount-war-one-piece-card-game",             release: "2023-03-10" },
  { code: "OP03", slug: "pillars-of-strength",       name: "Pillars of Strength",       justtcgId: "pillars-of-strength-one-piece-card-game",       release: "2023-06-30" },
  { code: "OP04", slug: "kingdoms-of-intrigue",      name: "Kingdoms of Intrigue",      justtcgId: "kingdoms-of-intrigue-one-piece-card-game",      release: "2023-09-22" },
  { code: "OP05", slug: "awakening-of-the-new-era",  name: "Awakening of the New Era",  justtcgId: "awakening-of-the-new-era-one-piece-card-game",  release: "2023-12-08" },
  { code: "OP06", slug: "wings-of-the-captain",      name: "Wings of the Captain",      justtcgId: "wings-of-the-captain-one-piece-card-game",      release: "2024-03-15" },
  { code: "OP07", slug: "500-years-in-the-future",   name: "500 Years in the Future",   justtcgId: "500-years-in-the-future-one-piece-card-game",   release: "2024-06-28" },
  { code: "OP08", slug: "two-legends",               name: "Two Legends",               justtcgId: "two-legends-one-piece-card-game",               release: "2024-09-13" },
  { code: "OP09", slug: "emperors-in-the-new-world", name: "Emperors in the New World", justtcgId: "emperors-in-the-new-world-one-piece-card-game", release: "2024-12-13" },
  { code: "OP10", slug: "royal-blood",               name: "Royal Blood",               justtcgId: "royal-blood-one-piece-card-game",               release: "2025-03-21" },
  { code: "OP11", slug: "a-fist-of-divine-speed",    name: "A Fist of Divine Speed",    justtcgId: "a-fist-of-divine-speed-one-piece-card-game",    release: "2025-06-06" },
  { code: "OP12", slug: "legacy-of-the-master",      name: "Legacy of the Master",      justtcgId: "legacy-of-the-master-one-piece-card-game",      release: "2025-08-22" },
  { code: "OP13", slug: "carrying-on-his-will",      name: "Carrying On His Will",      justtcgId: "carrying-on-his-will-one-piece-card-game",      release: "2025-11-07" },
  { code: "OP14", slug: "the-azure-seas-seven",      name: "The Azure Sea's Seven",     justtcgId: "the-azure-sea-s-seven-one-piece-card-game",     release: "2026-01-16" },
  { code: "OP15", slug: "adventure-on-kamis-island", name: "Adventure on Kami's Island", justtcgId: "adventure-on-kami-s-island-one-piece-card-game", release: "2026-04-03" },
  { code: "PRB02", slug: "premium-booster-vol-2",    name: "Premium Booster -The Best- Vol. 2", justtcgId: "premium-booster--the-best-vol-2-one-piece-card-game", release: "2025-10-03" },
];

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  // 1. Game record (idempotent)
  await sql`
    INSERT INTO games (slug, name, publisher)
    VALUES ('one-piece', 'One Piece Card Game', 'Bandai')
    ON CONFLICT (slug) DO NOTHING
  `;
  const [{ id: gameId }] = await sql<{ id: number }[]>`SELECT id FROM games WHERE slug = 'one-piece'`;
  console.log(`Game id=${gameId} (one-piece)`);

  // 2. Sets — wipe-and-reload for clean reruns. Cards FK cascades.
  await sql`DELETE FROM sets WHERE game_id = ${gameId}`;
  for (const s of MAIN_SETS) {
    await sql`
      INSERT INTO sets (game_id, slug, name, set_code, release_date, justtcg_set_id)
      VALUES (${gameId}, ${s.slug}, ${s.name}, ${s.code}, ${s.release}::date, ${s.justtcgId})
    `;
  }

  const rows = await sql`
    SELECT set_code, slug, name, release_date::text AS release_date, justtcg_set_id
    FROM sets WHERE game_id = ${gameId} ORDER BY release_date
  `;
  console.log(`\nOne Piece sets in DB (${rows.length}):`);
  for (const r of rows) console.log(`  ${r.set_code.padEnd(6)} ${r.release_date}  ${r.slug.padEnd(34)} ${r.name}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
