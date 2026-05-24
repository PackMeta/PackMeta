import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  const result = await sql`
    SELECT g.slug AS game,
           COUNT(*)::int AS total,
           COUNT(p.tcgplayer_product_id)::int AS with_id,
           COUNT(p.justtcg_product_id)::int AS with_jt
    FROM products p
    JOIN sets s ON s.id = p.set_id
    JOIN games g ON g.id = s.game_id
    GROUP BY g.slug
    ORDER BY g.slug
  `;
  console.log("Products by game (TCGPlayer ID coverage):");
  for (const r of result) {
    console.log(`  ${r.game.padEnd(12)} total=${r.total} with_tcg_id=${r.with_id} with_jt=${r.with_jt}`);
  }

  console.log("\nSample row to confirm shape:");
  const sample = await sql`
    SELECT g.slug AS game, p.name, p.tcgplayer_product_id, p.justtcg_product_id
    FROM products p
    JOIN sets s ON s.id = p.set_id
    JOIN games g ON g.id = s.game_id
    LIMIT 3
  `;
  for (const r of sample) console.log(r);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
