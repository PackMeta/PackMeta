import { ImageResponse } from "next/og";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const alt = "PackMeta — Should you rip it?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Data = {
  set_name: string;
  set_code: string;
  best_product_name: string | null;
  best_roi_pct: number | null;
  best_ev_cents: number | null;
  best_market_cents: number | null;
  top_card_name: string | null;
  top_card_cents: number | null;
};

async function loadOgData(slug: string): Promise<Data | null> {
  const rows = await db.execute<Data>(sql`
    WITH meta AS (
      SELECT s.id, s.name AS set_name, s.set_code
      FROM sets s JOIN games g ON g.id = s.game_id
      WHERE g.slug = 'lorcana' AND s.slug = ${slug}
    ),
    best_prod AS (
      SELECT DISTINCT ON (p.set_id) p.set_id, p.name AS best_product_name,
             p.current_roi_pct::float AS best_roi_pct,
             p.current_ev_cents AS best_ev_cents,
             p.current_market_cents AS best_market_cents
      FROM products p
      WHERE p.set_id = (SELECT id FROM meta)
        AND p.current_roi_pct IS NOT NULL
        AND p.current_roi_pct <= 100  /* cap outlier mispricings */
      ORDER BY p.set_id, p.current_roi_pct DESC
    ),
    top_card AS (
      SELECT DISTINCT ON (c.set_id) c.set_id, c.name AS top_card_name, c.current_market_cents AS top_card_cents
      FROM cards c
      WHERE c.set_id = (SELECT id FROM meta) AND c.current_market_cents IS NOT NULL
      ORDER BY c.set_id, c.current_market_cents DESC
    )
    SELECT m.set_name, m.set_code,
           bp.best_product_name, bp.best_roi_pct, bp.best_ev_cents, bp.best_market_cents,
           tc.top_card_name, tc.top_card_cents
    FROM meta m
    LEFT JOIN best_prod bp ON bp.set_id = m.id
    LEFT JOIN top_card tc ON tc.set_id = m.id
  `);
  return rows[0] ?? null;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadOgData(slug);
  if (!data) {
    return new ImageResponse(
      (
        <div style={{ ...baseStyle, justifyContent: "center", alignItems: "center" }}>
          <div style={{ fontSize: 64, color: "#fbbf24" }}>PackMeta</div>
        </div>
      ),
      size,
    );
  }

  const ripIt = data.best_roi_pct != null && data.best_roi_pct > 0;
  const verdictColor = ripIt ? "#34d399" : "#71717a";
  const verdictLabel = ripIt ? "RIP IT" : "HOLD";
  const usd = (cents: number | null) => (cents != null ? `$${(cents / 100).toFixed(2)}` : "—");

  return new ImageResponse(
    (
      <div style={baseStyle}>
        {/* Brand strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: "#fbbf24" }} />
          <div style={{ color: "#fbbf24", fontSize: 24, fontWeight: 600, letterSpacing: 2 }}>PACKMETA</div>
        </div>

        {/* Set title */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, color: "#71717a", fontSize: 26 }}>
            <span style={{ fontFamily: "monospace" }}>{data.set_code}</span>
            <span>Disney Lorcana</span>
          </div>
          <div style={{ color: "#f4f4f5", fontSize: 88, fontWeight: 700, lineHeight: 1.05, marginTop: 4 }}>
            {data.set_name}
          </div>
        </div>

        {/* Verdict block */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 56 }}>
          <div
            style={{
              padding: "16px 28px",
              borderRadius: 16,
              background: ripIt ? "rgba(52, 211, 153, 0.15)" : "rgba(63, 63, 70, 0.4)",
              border: `2px solid ${verdictColor}`,
              color: verdictColor,
              fontSize: 56,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            {verdictLabel}
          </div>
          {data.best_roi_pct != null && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: verdictColor, fontSize: 64, fontWeight: 700, fontFamily: "monospace" }}>
                {data.best_roi_pct > 0 ? "+" : ""}{data.best_roi_pct.toFixed(1)}% ROI
              </span>
              {data.best_product_name && (
                <span style={{ color: "#a1a1aa", fontSize: 22, marginTop: 4 }}>
                  {data.best_product_name.replace("Disney Lorcana: ", "")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Bottom strip — top chase */}
        {data.top_card_name && data.top_card_cents != null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "auto",
              paddingTop: 28,
              borderTop: "1px solid #27272a",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#71717a", fontSize: 18, letterSpacing: 2 }}>TOP CHASE</span>
              <span style={{ color: "#f4f4f5", fontSize: 36, fontWeight: 600, marginTop: 4 }}>
                {data.top_card_name.length > 50 ? data.top_card_name.slice(0, 50) + "…" : data.top_card_name}
              </span>
            </div>
            <div style={{ color: "#fbbf24", fontSize: 52, fontWeight: 700, fontFamily: "monospace" }}>
              {usd(data.top_card_cents)}
            </div>
          </div>
        )}
      </div>
    ),
    size,
  );
}

const baseStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 64,
  background: "linear-gradient(135deg, #09090b 0%, #18181b 100%)",
  color: "#f4f4f5",
  fontFamily: "system-ui, sans-serif",
};
