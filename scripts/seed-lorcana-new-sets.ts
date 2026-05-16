import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED;
  if (!url) throw new Error("DATABASE_URL_POOLED not set");
  const sql = postgres(url, { prepare: false });

  const [{ id: gameId }] = await sql<{ id: number }[]>`
    SELECT id FROM games WHERE slug = 'lorcana'
  `;

  const newSets = [
    { slug: "whispers-in-the-well", name: "Whispers in the Well", setCode: "S10" },
    { slug: "winterspell",          name: "Winterspell",          setCode: "S11" },
    { slug: "wilds-unknown",        name: "Wilds Unknown",        setCode: "S12" },
  ];

  for (const s of newSets) {
    await sql`
      INSERT INTO sets (game_id, slug, name, set_code)
      VALUES (${gameId}, ${s.slug}, ${s.name}, ${s.setCode})
      ON CONFLICT DO NOTHING
    `;
    console.log(`  inserted: ${s.setCode} ${s.slug}`);
  }

  const allSets = await sql`SELECT set_code, slug, name FROM sets WHERE game_id = ${gameId} ORDER BY set_code`;
  console.log(`\nLorcana sets in DB (${allSets.length}):`);
  for (const s of allSets) console.log(`  ${s.set_code} ${s.slug.padEnd(24)} ${s.name}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
