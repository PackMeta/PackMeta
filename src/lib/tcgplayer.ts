// TCGPlayer affiliate link builder. Set TCGPLAYER_PARTNER_CODE in Vercel env
// to start earning ~3.5% on click-throughs. Without it, links still work — they
// just don't credit us.

const PARTNER = process.env.TCGPLAYER_PARTNER_CODE?.trim() || null;

export function tcgplayerProductUrl(productId: number | null | undefined): string | null {
  if (!productId) return null;
  const url = new URL(`https://www.tcgplayer.com/product/${productId}`);
  if (PARTNER) {
    url.searchParams.set("partner", PARTNER);
    url.searchParams.set("utm_campaign", "affiliate");
    url.searchParams.set("utm_medium", PARTNER);
    url.searchParams.set("utm_source", PARTNER);
  }
  return url.toString();
}

export function tcgplayerSetSearchUrl(groupId: number | null | undefined): string | null {
  if (!groupId) return null;
  const url = new URL("https://www.tcgplayer.com/search/all/product");
  url.searchParams.set("productLineName", "");
  url.searchParams.set("setName", "");
  url.searchParams.set("view", "grid");
  if (PARTNER) {
    url.searchParams.set("partner", PARTNER);
    url.searchParams.set("utm_campaign", "affiliate");
    url.searchParams.set("utm_medium", PARTNER);
    url.searchParams.set("utm_source", PARTNER);
  }
  return url.toString();
}
