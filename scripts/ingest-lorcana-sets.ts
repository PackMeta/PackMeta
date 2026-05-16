import "dotenv/config";
import postgres from "postgres";

type JustTcgSet = {
  id: string;
  name: string;
  game_id: string;
  release_date: string;
  count: number;
  cards_count: number;
  sealed_count: number;
};

async function main() {
  const dbUrl = process.env.DATABASE_URL_POOLED;
  const apiKey = process.env.JUSTTCG_API_KEY;
  if (!dbUrl) throw new Error("DATABASE_URL_POOLED not set");
  if (!apiKey) throw new Error("JUSTTCG_API_KEY not set");

  const sql = postgres(dbUrl, { prepare: false });

  const res = await fetch("https://api.justtcg.com/v1/sets?game=disney-lorcana", {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`JustTCG /sets failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { data: JustTcgSet[] };
  const jtSets = body.data;
  console.log(`JustTCG returned ${jtSets.length} sets for disney-lorcana`);

  const ourSets = await sql<{ id: number; slug: string; name: string }[]>`
    SELECT s.id, s.slug, s.name
    FROM sets s
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'lorcana'
  `;
  const byNormName = new Map(ourSets.map((s) => [normalize(s.name), s]));

  let updated = 0;
  const unmatched: JustTcgSet[] = [];

  for (const jt of jtSets) {
    const ours = byNormName.get(normalize(jt.name));
    if (!ours) {
      unmatched.push(jt);
      continue;
    }
    await sql`
      UPDATE sets
      SET justtcg_set_id = ${jt.id},
          release_date = ${jt.release_date.slice(0, 10)}::date,
          card_count = ${jt.cards_count}
      WHERE id = ${ours.id}
    `;
    console.log(`  ✓ ${ours.slug.padEnd(24)} → ${jt.id} (${jt.cards_count} cards, ${jt.release_date.slice(0, 10)})`);
    updated++;
  }

  console.log(`\nUpdated ${updated}/${ourSets.length} of our sets with JustTCG IDs.`);

  if (unmatched.length) {
    console.log(`\n${unmatched.length} JustTCG sets not in our DB:`);
    for (const u of unmatched) {
      console.log(`  ${u.release_date.slice(0, 10)}  ${u.id.padEnd(50)} ${u.name}  (cards=${u.cards_count}, sealed=${u.sealed_count})`);
    }
  }

  await sql.end();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
