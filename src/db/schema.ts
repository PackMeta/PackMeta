import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Games ──────────────────────────────────────────────────────────────────
// One row per TCG we cover. Slug used in URLs (/lorcana, /one-piece, /pokemon).

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(), // 'lorcana' | 'one_piece' | 'pokemon'
  name: text("name").notNull(), // 'Disney Lorcana'
  publisher: text("publisher").notNull(), // 'Ravensburger'
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Sets ───────────────────────────────────────────────────────────────────
// Each set/expansion within a game.

export const sets = pgTable(
  "sets",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .references(() => games.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(), // 'azurite-sea'
    name: text("name").notNull(), // 'Azurite Sea'
    setCode: text("set_code"), // manufacturer code (e.g. 'OP01', '006')
    releaseDate: date("release_date"),
    cardCount: integer("card_count"),
    justtcgSetId: text("justtcg_set_id"), // foreign ID from JustTCG API
    tcgplayerGroupId: integer("tcgplayer_group_id"), // groupId in TCGCSV
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("sets_game_slug_idx").on(t.gameId, t.slug)],
);

// ─── Products ───────────────────────────────────────────────────────────────
// Sealed SKUs you can buy: booster pack, booster box, ETB, trove, etc.

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id")
      .references(() => sets.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(), // 'Lorcana Azurite Sea Booster Box'
    productType: text("product_type").notNull(), // 'booster_pack' | 'booster_box' | 'etb' | 'bundle' | 'collector_box' | 'trove'
    packCount: integer("pack_count"), // 1 for pack, 24 for box, etc.
    cardsPerPack: integer("cards_per_pack"),
    msrpCents: integer("msrp_cents"),
    justtcgProductId: text("justtcg_product_id"),
    tcgplayerProductId: integer("tcgplayer_product_id"),

    // Materialized EV stats (recomputed by daily cron)
    currentMarketCents: integer("current_market_cents"),
    currentEvCents: integer("current_ev_cents"),
    currentRoiPct: numeric("current_roi_pct", { precision: 6, scale: 2 }),
    volatilityScore: numeric("volatility_score", { precision: 4, scale: 2 }),
    lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("products_set_slug_idx").on(t.setId, t.slug),
    index("products_roi_idx").on(t.currentRoiPct),
  ],
);

// ─── Pull Rate Templates ────────────────────────────────────────────────────
// Per-set, per-pack-type, per-slot probability of pulling each rarity.
// A booster might have: slot 1 = always Common, slot 12 = foil with weighted rarity.

export const pullRateTemplates = pgTable(
  "pull_rate_templates",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id")
      .references(() => sets.id, { onDelete: "cascade" })
      .notNull(),
    packType: text("pack_type").notNull(), // 'booster_pack' | 'collector_booster'
    slotIndex: integer("slot_index").notNull(), // 1..N where N = cards per pack
    rarity: text("rarity").notNull(), // 'Common', 'Enchanted', 'Secret Rare', etc.
    probability: numeric("probability", { precision: 10, scale: 8 }).notNull(), // 0..1
    sourceNotes: text("source_notes"), // 'Community: u/Narzghal Fabled poll (n=700+)'
  },
  (t) => [
    uniqueIndex("prt_set_pack_slot_rarity_idx").on(
      t.setId,
      t.packType,
      t.slotIndex,
      t.rarity,
    ),
  ],
);

// ─── Cards ──────────────────────────────────────────────────────────────────
// One row per card per variant (foil vs non-foil = separate rows).

export const cards = pgTable(
  "cards",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id")
      .references(() => sets.id, { onDelete: "cascade" })
      .notNull(),
    cardNumber: text("card_number").notNull(), // '001/204'
    name: text("name").notNull(),
    rarity: text("rarity").notNull(),
    variant: text("variant"), // 'foil' | 'non-foil' | 'enchanted' | 'manga-rare' | 'cold-foil' | null
    justtcgCardId: text("justtcg_card_id"),
    justtcgVariantId: text("justtcg_variant_id"),
    tcgplayerProductId: integer("tcgplayer_product_id"),
    imageUrl: text("image_url"),

    currentMarketCents: integer("current_market_cents"),
    lastPriceAt: timestamp("last_price_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("cards_justtcg_card_id_idx").on(t.justtcgCardId),
    index("cards_set_number_variant_idx").on(
      t.setId,
      t.cardNumber,
      t.variant,
    ),
    index("cards_market_idx").on(t.currentMarketCents),
  ],
);

// ─── Prices ─────────────────────────────────────────────────────────────────
// Daily snapshot per card per source. We aggregate this into card.currentMarketCents.

export const prices = pgTable(
  "prices",
  {
    id: serial("id").primaryKey(),
    cardId: integer("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    source: text("source").notNull(), // 'justtcg' | 'tcgcsv' | 'ebay'
    marketCents: integer("market_cents"),
    lowCents: integer("low_cents"),
    highCents: integer("high_cents"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("prices_card_recorded_idx").on(t.cardId, t.recordedAt)],
);

// ─── Type exports ───────────────────────────────────────────────────────────

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Set = typeof sets.$inferSelect;
export type NewSet = typeof sets.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type PullRateTemplate = typeof pullRateTemplates.$inferSelect;
export type NewPullRateTemplate = typeof pullRateTemplates.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Price = typeof prices.$inferSelect;
export type NewPrice = typeof prices.$inferInsert;
