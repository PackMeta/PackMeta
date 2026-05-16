import "dotenv/config";
import postgres from "postgres";

// Lorcana booster pack composition (per data foundation doc):
//   Slots 1-6  : Common
//   Slots 7-9  : Uncommon
//   Slots 10-11: Rare / Super Rare / Legendary
//   Slot 12    : Foil (any rarity, including Enchanted/Iconic/Epic in Fabled+)
//
// "Generic baseline" rates from the doc: Enchanted ~1/96 packs, Legendary ~1/5-6.
// Fabled-specific community poll (n=700+): Enchanted 2.03%/pack, Legendary 19.49%/pack.
// We invert the per-pack rates to per-slot rates for the rare-slot pair.

type Slot = { idx: number; rarity: string; prob: number };

function makePackSlots(opts: {
  // per-rare-slot independent probabilities (sum to 1.0)
  rareSlot: { rare: number; superRare: number; legendary: number };
  // per-foil-slot independent probabilities (sum to 1.0)
  foilSlot: { common: number; uncommon: number; rare: number; superRare: number; legendary: number; enchanted: number; iconic: number; epic: number };
}): Slot[] {
  const slots: Slot[] = [];
  for (let i = 1; i <= 6; i++) slots.push({ idx: i, rarity: "Common", prob: 1 });
  for (let i = 7; i <= 9; i++) slots.push({ idx: i, rarity: "Uncommon", prob: 1 });
  for (const idx of [10, 11]) {
    slots.push({ idx, rarity: "Rare", prob: opts.rareSlot.rare });
    slots.push({ idx, rarity: "Super Rare", prob: opts.rareSlot.superRare });
    slots.push({ idx, rarity: "Legendary", prob: opts.rareSlot.legendary });
  }
  const f = opts.foilSlot;
  slots.push({ idx: 12, rarity: "Common", prob: f.common });
  slots.push({ idx: 12, rarity: "Uncommon", prob: f.uncommon });
  slots.push({ idx: 12, rarity: "Rare", prob: f.rare });
  slots.push({ idx: 12, rarity: "Super Rare", prob: f.superRare });
  slots.push({ idx: 12, rarity: "Legendary", prob: f.legendary });
  slots.push({ idx: 12, rarity: "Enchanted", prob: f.enchanted });
  slots.push({ idx: 12, rarity: "Iconic", prob: f.iconic });
  slots.push({ idx: 12, rarity: "Epic", prob: f.epic });
  return slots;
}

// Invert "P(at least 1 Legendary per pack)" → per-rare-slot Legendary probability.
//   P(no L in either slot) = (1 - p)^2  ⟹  p = 1 - sqrt(1 - perPack)
const perSlot = (perPack: number) => 1 - Math.sqrt(1 - perPack);

const GENERIC_BASELINE = {
  // ~1/5.5 packs Legendary = 18% per pack
  rareSlot: { rare: 1 - perSlot(0.18) - 0.13, superRare: 0.13, legendary: perSlot(0.18) },
  // Foil slot: common-heavy with tail of rares + Enchanted
  foilSlot: {
    common: 0.59, uncommon: 0.22, rare: 0.13, superRare: 0.03, legendary: 0.025,
    enchanted: 0.0104, // ~1/96 packs baseline
    iconic: 0, epic: 0,
  },
};

const FABLED_POLL = {
  // Set 9 Fabled — polled rates: Legendary 19.49%/pack, Enchanted 2.03%/pack, Legendary Foil 2.4%/pack
  rareSlot: { rare: 1 - perSlot(0.1949) - 0.13, superRare: 0.13, legendary: perSlot(0.1949) },
  foilSlot: {
    common: 0.55, uncommon: 0.21, rare: 0.13, superRare: 0.034, legendary: 0.024,
    enchanted: 0.0203,
    iconic: 0.008, // placeholder — community data emerging, will refine
    epic: 0.014, // placeholder — Epic is more common than Iconic per early reports
  },
};

const REIGN_OF_JAFAR_POLL = {
  // Set 8 — polled rates: Legendary 18.19%/pack, Enchanted 1.22%/pack
  rareSlot: { rare: 1 - perSlot(0.1819) - 0.13, superRare: 0.13, legendary: perSlot(0.1819) },
  foilSlot: {
    common: 0.60, uncommon: 0.22, rare: 0.13, superRare: 0.032, legendary: 0.024,
    enchanted: 0.0122,
    iconic: 0, epic: 0,
  },
};

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  const sets = await sql<{ id: number; slug: string; set_code: string }[]>`
    SELECT s.id, s.slug, s.set_code FROM sets s JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'lorcana'
    ORDER BY s.release_date NULLS LAST, s.set_code
  `;

  await sql`DELETE FROM pull_rate_templates WHERE set_id IN (SELECT id FROM sets WHERE game_id IN (SELECT id FROM games WHERE slug = 'lorcana'))`;

  let totalRows = 0;
  for (const set of sets) {
    let profile = GENERIC_BASELINE;
    let sourceNote = "Generic Lorcana baseline (community avg, refine with polls)";
    if (set.set_code === "S8") {
      profile = REIGN_OF_JAFAR_POLL;
      sourceNote = "Community poll: u/Narzghal n=479 — Reign of Jafar";
    }
    if (set.set_code === "S9") {
      profile = FABLED_POLL;
      sourceNote = "Community poll: u/Narzghal n=700+ — Fabled (Iconic/Epic placeholders)";
    }

    const slots = makePackSlots(profile);
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

  console.log(`Seeded ${totalRows} pull-rate template rows across ${sets.length} Lorcana sets.`);

  const peek = await sql`
    SELECT s.set_code, prt.slot_index, prt.rarity, ROUND(prt.probability::numeric * 100, 3) AS pct
    FROM pull_rate_templates prt JOIN sets s ON s.id = prt.set_id
    WHERE s.game_id = (SELECT id FROM games WHERE slug='lorcana') AND s.set_code IN ('S1','S9')
    ORDER BY s.set_code, prt.slot_index, prt.probability DESC
  `;
  console.log(`\nSample S1 (generic) vs S9 (Fabled poll):`);
  for (const r of peek) console.log(`  ${r.set_code} slot ${r.slot_index.toString().padStart(2)}  ${r.rarity.padEnd(12)} ${r.pct}%`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
