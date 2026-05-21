export type Game = {
  slug: string;
  name: string;       // short label e.g. "Lorcana"
  fullName: string;   // long label e.g. "Disney Lorcana"
  blurb: string;      // displayed under the game header
};

export const GAMES: Record<string, Game> = {
  lorcana: {
    slug: "lorcana",
    name: "Lorcana",
    fullName: "Disney Lorcana",
    blurb:
      "Pack expected value across every set, calculated from live market prices and community pull rates.",
  },
  "one-piece": {
    slug: "one-piece",
    name: "One Piece",
    fullName: "One Piece Card Game",
    blurb:
      "Pack expected value across main booster sets, calculated from live market prices and Bandai-published pull rates.",
  },
  pokemon: {
    slug: "pokemon",
    name: "Pokémon",
    fullName: "Pokémon TCG",
    blurb:
      "Pack expected value across Scarlet & Violet and Mega Evolution era sets, calculated from live market prices and TCGplayer pull rates.",
  },
};

export function getGame(slug: string): Game | null {
  return GAMES[slug] ?? null;
}
