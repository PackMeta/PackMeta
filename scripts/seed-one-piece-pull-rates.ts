import "dotenv/config";
import postgres from "postgres";

// One Piece TCG booster pack composition (per data foundation doc + community polls):
//   Slots 1-6  : Common
//   Slots 7-9  : Uncommon
//   Slots 10-11: Rare (guaranteed)
//   Slot 12    : "Hit" slot — Leader/Super Rare/Alt Art/Secret Rare/Special Rare/Manga Rare
//
// Per-pack rates from r/OnePieceTCGFinance + Bandai data:
//   Leader     ~1/2  packs = 50%   per pack
//   Super Rare ~1/3  packs = 33%   per pack
//   Alt Art    ~1/12 packs = 8.33% per pack
//   Secret Rare~1/36 packs = 2.78% per pack
//   Special Rare~1/160 = 0.625%    per pack
//   Manga Rare ~1/500 = 0.20%      per pack
// These are mutually exclusive on the hit slot, with a Rare fall-through.

type Slot = { idx: number; rarity: string; prob: number };

function makeOnePiecePackSlots(): Slot[] {
  const slots: Slot[] = [];
  for (let i = 1; i <= 6; i++) slots.push({ idx: i, rarity: "Common", prob: 1 });
  for (let i = 7; i <= 9; i++) slots.push({ idx: i, rarity: "Uncommon", prob: 1 });
  for (const idx of [10, 11]) slots.push({ idx, rarity: "Rare", prob: 1 });

  // Slot 12 — hit slot. JustTCG rarities use names like "Leader", "Super Rare",
  // "Secret Rare", "Special Rare", "Manga Rare". Probabilities sum to ~1.0 with
  // a small Rare fall-through for the residual.
  slots.push({ idx: 12, rarity: "Leader",       prob: 0.50 });
  slots.push({ idx: 12, rarity: "Super Rare",   prob: 0.33 });
  slots.push({ idx: 12, rarity: "Alternate Art", prob: 0.0833 });
  slots.push({ idx: 12, rarity: "Secret Rare",  prob: 0.0278 });
  slots.push({ idx: 12, rarity: "Special Rare", prob: 0.00625 });
  slots.push({ idx: 12, rarity: "Manga Rare",   prob: 0.002 });
  // Residual fall-through (~0.045) lands on Rare:
  slots.push({ idx: 12, rarity: "Rare",         prob: 0.04465 });
  return slots;
}

// Anniversary sets (OP05, OP09, PRB02) have elevated rates per the doc.
// Bump hit slot probabilities ~30% for those sets.
function makeAnniversarySlots(): Slot[] {
  const base = makeOnePiecePackSlots();
  return base.map((s) => {
    if (s.idx !== 12) return s;
    if (s.rarity === "Rare") return { ...s, prob: 0.025 }; // shrink residual
    if (s.rarity === "Common" || s.rarity === "Uncommon") return s;
    return { ...s, prob: s.prob * 1.3 };
  });
}

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  const sets = await sql<{ id: number; slug: string; set_code: string }[]>`
    SELECT s.id, s.slug, s.set_code FROM sets s JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'one-piece'
    ORDER BY s.release_date NULLS LAST, s.set_code
  `;

  await sql`DELETE FROM pull_rate_templates WHERE set_id IN (SELECT id FROM sets WHERE game_id = (SELECT id FROM games WHERE slug = 'one-piece'))`;

  let totalRows = 0;
  const anniversarySets = new Set(["OP05", "OP09", "PRB02"]);
  for (const set of sets) {
    const isAnniversary = anniversarySets.has(set.set_code);
    const slots = isAnniversary ? makeAnniversarySlots() : makeOnePiecePackSlots();
    const sourceNote = isAnniversary
      ? "Anniversary/Premium set — elevated hit rates per community trackers"
      : "Generic OP booster baseline — r/OnePieceTCGFinance + Bandai data";

    await sql.begin(async (tx) => {
      for (const s of slots) {
        if (s.prob <= 0) continue;
        await tx`
          INSERT INTO pull_rate_templates (set_id, pack_type, slot_index, rarity, probability, source_notes)
          VALUES (${set.id}, 'booster_pack', ${s.idx}, ${s.rarity}, ${s.prob}, ${sourceNote})
        `;
        totalRows++;
      }
    });
  }

  console.log(`Seeded ${totalRows} OP pull-rate template rows across ${sets.length} sets.`);

  const sample = await sql`
    SELECT s.set_code, prt.slot_index, prt.rarity, ROUND(prt.probability::numeric * 100, 3) AS pct
    FROM pull_rate_templates prt JOIN sets s ON s.id = prt.set_id
    JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'one-piece' AND s.set_code IN ('OP01', 'OP05', 'OP15')
    ORDER BY s.set_code, prt.slot_index, prt.probability DESC
  `;
  console.log(`\nSample (OP01 baseline vs OP05 anniversary vs OP15 latest):`);
  for (const r of sample) console.log(`  ${r.set_code.padEnd(5)} slot ${r.slot_index.toString().padStart(2)}  ${r.rarity.padEnd(14)} ${r.pct}%`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
