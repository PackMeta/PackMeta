import "dotenv/config";
import postgres from "postgres";

// Curated SV + Mega era subset — the sets that drive current search volume.
// Skipping starter products, McDonald's promos, energies, theme decks for v1.
const MAIN_SETS = [
  { code: "SV08", slug: "surging-sparks",       name: "Surging Sparks",       justtcgId: "sv08-surging-sparks-pokemon",       release: "2024-11-08" },
  { code: "SVPR", slug: "prismatic-evolutions", name: "Prismatic Evolutions", justtcgId: "sv-prismatic-evolutions-pokemon",   release: "2025-01-17" },
  { code: "SV09", slug: "journey-together",     name: "Journey Together",     justtcgId: "sv09-journey-together-pokemon",     release: "2025-03-28" },
  { code: "SV10", slug: "destined-rivals",      name: "Destined Rivals",      justtcgId: "sv10-destined-rivals-pokemon",      release: "2025-05-30" },
  { code: "SVBB", slug: "black-bolt",           name: "Black Bolt",           justtcgId: "sv-black-bolt-pokemon",             release: "2025-07-18" },
  { code: "SVWF", slug: "white-flare",          name: "White Flare",          justtcgId: "sv-white-flare-pokemon",            release: "2025-07-18" },
  { code: "ME01", slug: "mega-evolution",       name: "Mega Evolution",       justtcgId: "me01-mega-evolution-pokemon",       release: "2025-09-26" },
  { code: "ME03", slug: "perfect-order",        name: "Perfect Order",        justtcgId: "me03-perfect-order-pokemon",        release: "2026-03-27" },
  { code: "ME04", slug: "chaos-rising",         name: "Chaos Rising",         justtcgId: "me04-chaos-rising-pokemon",         release: "2026-05-22" },
];

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  await sql`
    INSERT INTO games (slug, name, publisher)
    VALUES ('pokemon', 'Pokémon TCG', 'The Pokémon Company International')
    ON CONFLICT (slug) DO NOTHING
  `;
  const [{ id: gameId }] = await sql<{ id: number }[]>`SELECT id FROM games WHERE slug = 'pokemon'`;
  console.log(`Game id=${gameId} (pokemon)`);

  await sql`DELETE FROM sets WHERE game_id = ${gameId}`;
  for (const s of MAIN_SETS) {
    await sql`
      INSERT INTO sets (game_id, slug, name, set_code, release_date, justtcg_set_id)
      VALUES (${gameId}, ${s.slug}, ${s.name}, ${s.code}, ${s.release}::date, ${s.justtcgId})
    `;
  }

  const rows = await sql`SELECT set_code, slug, name, release_date::text AS release_date FROM sets WHERE game_id = ${gameId} ORDER BY release_date`;
  console.log(`\nPokemon sets in DB (${rows.length}):`);
  for (const r of rows) console.log(`  ${r.set_code.padEnd(6)} ${r.release_date}  ${r.slug.padEnd(24)} ${r.name}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
