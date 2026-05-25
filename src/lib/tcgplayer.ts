// TCGPlayer Impact affiliate deep-link builder. Set TCGPLAYER_AFFILIATE_BASE
// in Vercel env to your Impact tracking link prefix, e.g.
// "https://partner.tcgplayer.com/c/7328132/1780961/21018". Without it, links
// still work — they just don't credit us.

const AFFILIATE_BASE = process.env.TCGPLAYER_AFFILIATE_BASE?.trim().replace(/\/$/, "") || null;

function wrapAffiliate(destinationUrl: string): string {
  if (!AFFILIATE_BASE) return destinationUrl;
  return `${AFFILIATE_BASE}?u=${encodeURIComponent(destinationUrl)}`;
}

export function tcgplayerProductUrl(productId: number | null | undefined): string | null {
  if (!productId) return null;
  return wrapAffiliate(`https://www.tcgplayer.com/product/${productId}`);
}

export function tcgplayerSetSearchUrl(groupId: number | null | undefined): string | null {
  if (!groupId) return null;
  const url = new URL("https://www.tcgplayer.com/search/all/product");
  url.searchParams.set("productLineName", "");
  url.searchParams.set("setName", "");
  url.searchParams.set("view", "grid");
  return wrapAffiliate(url.toString());
}
