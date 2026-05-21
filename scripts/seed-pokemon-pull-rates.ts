import "dotenv/config";
import postgres from "postgres";

// Modern Pokemon SV/Mega-era booster (10 cards per pack):
//   Slots 1-4 : Common
//   Slots 5-7 : Uncommon
//   Slot 8    : Reverse Holo (Common/Uncommon/Rare reverse-treated)
//   Slot 9    : Rare slot — Rare → Ultra Rare → Hyper / Mega Hyper tail
//   Slot 10   : Hit slot — Double Rare → Illustration Rare → SIR / Hyper / Mega Hyper
//
// Standard SV pull rates (per TCGplayer + community trackers):
//   Hit rate (Double Rare+) ~25-28% per pack
//   SIR: ~1/80 packs
//   Hyper Rare: ~1/100-150
//
// Special sets (Prismatic, Crown Zenith, Hidden Fates) have ~35-40% hit rate.
//
// Mega Evolution series (ME01-ME04): SIR ~1/78-92, Mega Hyper Rare ~1/1250.

type Slot = { idx: number; rarity: string; prob: number };
type Profile = "standard" | "prismatic" | "mega";

function makePokemonPackSlots(profile: Profile): Slot[] {
  const slots: Slot[] = [];
  for (let i = 1; i <= 4; i++) slots.push({ idx: i, rarity: "Common", prob: 1 });
  for (let i = 5; i <= 7; i++) slots.push({ idx: i, rarity: "Uncommon", prob: 1 });

  // Slot 8: Reverse Holo — JustTCG rarities are still C/UC/R but variant=Holofoil.
  // For EV purposes treat as a 60/30/10 weighted slot since reverse can be any.
  slots.push({ idx: 8, rarity: "Common", prob: 0.60 });
  slots.push({ idx: 8, rarity: "Uncommon", prob: 0.30 });
  slots.push({ idx: 8, rarity: "Rare", prob: 0.10 });

  // Slot 9: Rare/Ultra Rare slot — mostly Rare with upgrade tail.
  if (profile === "prismatic") {
    slots.push({ idx: 9, rarity: "Rare", prob: 0.55 });
    slots.push({ idx: 9, rarity: "Double Rare", prob: 0.18 });
    slots.push({ idx: 9, rarity: "Ultra Rare", prob: 0.13 });
    slots.push({ idx: 9, rarity: "Illustration Rare", prob: 0.08 });
    slots.push({ idx: 9, rarity: "Special Illustration Rare", prob: 0.04 });
    slots.push({ idx: 9, rarity: "Hyper Rare", prob: 0.02 });
  } else {
    slots.push({ idx: 9, rarity: "Rare", prob: 0.70 });
    slots.push({ idx: 9, rarity: "Double Rare", prob: 0.15 });
    slots.push({ idx: 9, rarity: "Ultra Rare", prob: 0.08 });
    slots.push({ idx: 9, rarity: "Illustration Rare", prob: 0.05 });
    slots.push({ idx: 9, rarity: "Special Illustration Rare", prob: 0.015 });
    slots.push({ idx: 9, rarity: "Hyper Rare", prob: 0.005 });
  }

  // Slot 10: Hit slot — guarantees a Double Rare+ in modern Pokemon.
  if (profile === "mega") {
    slots.push({ idx: 10, rarity: "Double Rare", prob: 0.50 });
    slots.push({ idx: 10, rarity: "Ultra Rare", prob: 0.20 });
    slots.push({ idx: 10, rarity: "Illustration Rare", prob: 0.18 });
    slots.push({ idx: 10, rarity: "Special Illustration Rare", prob: 0.09 });
    slots.push({ idx: 10, rarity: "Hyper Rare", prob: 0.025 });
    slots.push({ idx: 10, rarity: "Mega Hyper Rare", prob: 0.005 });
  } else if (profile === "prismatic") {
    slots.push({ idx: 10, rarity: "Double Rare", prob: 0.42 });
    slots.push({ idx: 10, rarity: "Ultra Rare", prob: 0.22 });
    slots.push({ idx: 10, rarity: "Illustration Rare", prob: 0.18 });
    slots.push({ idx: 10, rarity: "Special Illustration Rare", prob: 0.13 });
    slots.push({ idx: 10, rarity: "Hyper Rare", prob: 0.05 });
  } else {
    slots.push({ idx: 10, rarity: "Double Rare", prob: 0.55 });
    slots.push({ idx: 10, rarity: "Ultra Rare", prob: 0.22 });
    slots.push({ idx: 10, rarity: "Illustration Rare", prob: 0.15 });
    slots.push({ idx: 10, rarity: "Special Illustration Rare", prob: 0.06 });
    slots.push({ idx: 10, rarity: "Hyper Rare", prob: 0.02 });
  }

  return slots;
}

async function main() {
  const url = process.env.DATABASE_URL_POOLED!;
  const sql = postgres(url, { prepare: false });

  const sets = await sql<{ id: number; slug: string; set_code: string }[]>`
    SELECT s.id, s.slug, s.set_code
    FROM sets s JOIN games g ON g.id = s.game_id
    WHERE g.slug = 'pokemon'
    ORDER BY s.release_date NULLS LAST, s.set_code
  `;

  await sql`DELETE FROM pull_rate_templates WHERE set_id IN (SELECT id FROM sets WHERE game_id = (SELECT id FROM games WHERE slug = 'pokemon'))`;

  let totalRows = 0;
  for (const set of sets) {
    let profile: Profile = "standard";
    if (set.set_code === "SVPR") profile = "prismatic";
    if (set.set_code.startsWith("ME")) profile = "mega";

    const slots = makePokemonPackSlots(profile);
    const sourceNote = profile === "standard"
      ? "Standard SV-era pull rates (~25-28%/pack hit rate, SIR 1/80)"
      : profile === "prismatic"
      ? "Prismatic Evolutions / special-set elevated rates (~35-40%/pack hit rate)"
      : "Mega Evolution series — SIR 1/78-92, Mega Hyper Rare 1/1250";

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

  console.log(`Seeded ${totalRows} Pokemon pull-rate template rows across ${sets.length} sets.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
