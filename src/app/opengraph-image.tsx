import { ImageResponse } from "next/og";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const alt = "PackMeta — Should you rip it?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Hot = {
  product_name: string;
  set_name: string;
  roi_pct: number;
  market_cents: number;
  ev_cents: number;
};

async function loadHot(): Promise<Hot | null> {
  const rows = await db.execute<Hot>(sql`
    SELECT p.name AS product_name, s.name AS set_name,
           p.current_roi_pct::float AS roi_pct,
           p.current_market_cents AS market_cents,
           p.current_ev_cents AS ev_cents
    FROM products p
    JOIN sets s ON s.id = p.set_id
    WHERE p.current_roi_pct IS NOT NULL
      AND p.current_market_cents IS NOT NULL
      AND p.current_market_cents > 1000
      AND p.current_roi_pct BETWEEN 0 AND 100
      AND p.product_type IN ('booster_pack', 'sleeved_booster_pack', 'booster_box', 'booster_case', 'trove')
    ORDER BY p.current_roi_pct DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export default async function Image() {
  const hot = await loadHot();

  return new ImageResponse(
    (
      <div style={baseStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: "#fbbf24" }} />
          <div style={{ color: "#fbbf24", fontSize: 24, fontWeight: 600, letterSpacing: 2 }}>PACKMETA</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
          <div style={{ color: "#f4f4f5", fontSize: 108, fontWeight: 700, lineHeight: 1.05 }}>
            Should you rip it?
          </div>
          <div style={{ color: "#a1a1aa", fontSize: 32, marginTop: 24, maxWidth: 900 }}>
            Live pack expected value for every TCG box, bundle, and pack. Cross-game leaderboard. No paywall.
          </div>
        </div>

        {hot && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "auto",
              padding: 24,
              border: "2px solid rgba(52, 211, 153, 0.4)",
              background: "rgba(52, 211, 153, 0.1)",
              borderRadius: 16,
            }}
          >
            <div style={{ color: "#34d399", fontSize: 20, letterSpacing: 2 }}>HOT RIGHT NOW</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
                <span style={{ color: "#f4f4f5", fontSize: 38, fontWeight: 600 }}>
                  {hot.product_name.replace("Disney Lorcana: ", "")}
                </span>
                <span style={{ color: "#a1a1aa", fontSize: 22, marginTop: 4 }}>
                  Pay ${(hot.market_cents / 100).toFixed(2)} · EV ${(hot.ev_cents / 100).toFixed(2)}
                </span>
              </div>
              <span style={{ color: "#34d399", fontSize: 64, fontWeight: 700, fontFamily: "monospace" }}>
                +{hot.roi_pct.toFixed(1)}%
              </span>
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
