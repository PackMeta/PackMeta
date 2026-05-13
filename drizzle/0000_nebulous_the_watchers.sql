CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"set_id" integer NOT NULL,
	"card_number" text NOT NULL,
	"name" text NOT NULL,
	"rarity" text NOT NULL,
	"variant" text,
	"justtcg_card_id" text,
	"justtcg_variant_id" text,
	"tcgplayer_product_id" integer,
	"image_url" text,
	"current_market_cents" integer,
	"last_price_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"publisher" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"source" text NOT NULL,
	"market_cents" integer,
	"low_cents" integer,
	"high_cents" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"set_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"product_type" text NOT NULL,
	"pack_count" integer,
	"cards_per_pack" integer,
	"msrp_cents" integer,
	"justtcg_product_id" text,
	"tcgplayer_product_id" integer,
	"current_market_cents" integer,
	"current_ev_cents" integer,
	"current_roi_pct" numeric(6, 2),
	"volatility_score" numeric(4, 2),
	"last_calculated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_rate_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"set_id" integer NOT NULL,
	"pack_type" text NOT NULL,
	"slot_index" integer NOT NULL,
	"rarity" text NOT NULL,
	"probability" numeric(10, 8) NOT NULL,
	"source_notes" text
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"set_code" text,
	"release_date" date,
	"card_count" integer,
	"justtcg_set_id" text,
	"tcgplayer_group_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_rate_templates" ADD CONSTRAINT "pull_rate_templates_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cards_set_number_variant_idx" ON "cards" USING btree ("set_id","card_number","variant");--> statement-breakpoint
CREATE INDEX "cards_market_idx" ON "cards" USING btree ("current_market_cents");--> statement-breakpoint
CREATE INDEX "prices_card_recorded_idx" ON "prices" USING btree ("card_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_set_slug_idx" ON "products" USING btree ("set_id","slug");--> statement-breakpoint
CREATE INDEX "products_roi_idx" ON "products" USING btree ("current_roi_pct");--> statement-breakpoint
CREATE UNIQUE INDEX "prt_set_pack_slot_rarity_idx" ON "pull_rate_templates" USING btree ("set_id","pack_type","slot_index","rarity");--> statement-breakpoint
CREATE UNIQUE INDEX "sets_game_slug_idx" ON "sets" USING btree ("game_id","slug");