import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });
  const rows = await sql`
    SELECT s.set_code, s.slug, COUNT(c.id)::int AS card_count
    FROM sets s
    LEFT JOIN cards c ON c.set_id = s.id
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'lorcana'
    GROUP BY s.set_code, s.slug
    ORDER BY s.set_code
  `;
  for (const r of rows) console.log(`  ${r.set_code.padEnd(4)} ${r.slug.padEnd(24)} ${r.card_count}`);
  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM cards`;
  console.log(`\nTOTAL cards: ${total}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
