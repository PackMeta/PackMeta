import type { MetadataRoute } from "next";
import { db } from "@/db";
import { sql } from "drizzle-orm";

const BASE = "https://packmeta.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await db.execute<{ game_slug: string; set_slug: string; updated: string }>(sql`
    SELECT g.slug AS game_slug, s.slug AS set_slug,
           COALESCE(MAX(p.last_calculated_at), s.created_at)::text AS updated
    FROM sets s
    JOIN games g ON g.id = s.game_id
    LEFT JOIN products p ON p.set_id = s.id
    WHERE EXISTS (SELECT 1 FROM cards c WHERE c.set_id = s.id)
    GROUP BY g.slug, s.slug, s.created_at
  `);

  const sets = Array.from(rows);
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];

  const gameSlugs = Array.from(new Set(sets.map((s) => s.game_slug)));
  const gamePages: MetadataRoute.Sitemap = gameSlugs.map((g) => ({
    url: `${BASE}/${g}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.9,
  }));

  const setPages: MetadataRoute.Sitemap = sets.map((r) => ({
    url: `${BASE}/${r.game_slug}/${r.set_slug}`,
    lastModified: r.updated ? new Date(r.updated) : now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticPages, ...gamePages, ...setPages];
}
