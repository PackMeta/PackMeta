// Monte Carlo EV engine for booster pack expected value.
//
// Algorithm (per data foundation doc):
//   For each Monte Carlo iteration:
//     For each pack in the product (1 for pack, 24 for box, 96 for case):
//       For each of the 12 slots:
//         Sample a rarity from the slot's pull-rate distribution
//         Sample uniformly from the set's cards of that rarity
//         Add card market price to the pack value
//   Aggregate iterations → mean, percentiles, std deviation.

export type SlotRate = { slotIndex: number; rarity: string; probability: number };
export type CardLite = { rarity: string; marketCents: number };

export type SetData = {
  cardsByRarity: Map<string, CardLite[]>;
  ratesBySlot: Map<number, SlotRate[]>;
  cardsPerPack: number;
};

export type EVResult = {
  iterations: number;
  packCount: number;
  meanCents: number;
  p25Cents: number;
  p50Cents: number;
  p75Cents: number;
  stdDevCents: number;
};

// Mulberry32 — small, fast deterministic PRNG. Optional seed for reproducibility.
function makeRng(seed: number = (Math.random() * 2 ** 32) | 0) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleRarity(rng: () => number, slotRates: SlotRate[]): string | null {
  const r = rng();
  let acc = 0;
  for (const sr of slotRates) {
    acc += sr.probability;
    if (r < acc) return sr.rarity;
  }
  // sum < 1 → no card in this slot (rare, but possible if rates don't sum to 1)
  return null;
}

function samplePackCents(rng: () => number, data: SetData): number {
  let sum = 0;
  for (let slot = 1; slot <= data.cardsPerPack; slot++) {
    const rates = data.ratesBySlot.get(slot);
    if (!rates) continue;
    const rarity = sampleRarity(rng, rates);
    if (!rarity) continue;
    const pool = data.cardsByRarity.get(rarity);
    if (!pool || pool.length === 0) continue;
    const card = pool[Math.floor(rng() * pool.length)];
    sum += card.marketCents;
  }
  return sum;
}

export function simulate(
  data: SetData,
  packCount: number,
  iterations: number = 10_000,
  seed?: number,
): EVResult {
  const rng = makeRng(seed);
  const totals = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let productSum = 0;
    for (let p = 0; p < packCount; p++) productSum += samplePackCents(rng, data);
    totals[i] = productSum;
  }
  const sorted = Float64Array.from(totals).sort();
  const pick = (q: number) => Math.round(sorted[Math.floor(q * (iterations - 1))]);
  const mean = totals.reduce((a, b) => a + b, 0) / iterations;
  const variance = totals.reduce((a, b) => a + (b - mean) ** 2, 0) / iterations;
  return {
    iterations,
    packCount,
    meanCents: Math.round(mean),
    p25Cents: pick(0.25),
    p50Cents: pick(0.5),
    p75Cents: pick(0.75),
    stdDevCents: Math.round(Math.sqrt(variance)),
  };
}
