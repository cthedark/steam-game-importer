/**
 * Artwork type definitions and SteamGridDB integration.
 * Handles searching for games and fetching artwork URLs.
 */

import SGDB from "steamgriddb";
import fuzzysort from "fuzzysort";

export const ARTWORK_TYPES = ["tall", "long", "hero", "logo", "icon"] as const;
export type ArtworkType = (typeof ARTWORK_TYPES)[number];

export interface ArtworkDimensions {
  width: number;
  height: number;
}

export const ARTWORK_META: Record<ArtworkType, {
  label: string;
  dimensions: ArtworkDimensions;
  /** Suffix used in Steam grid filenames: e.g. shortAppId + suffix + ".png" */
  fileSuffix: string;
}> = {
  tall:  { label: "Portrait (600×900)",   dimensions: { width: 600, height: 900 },  fileSuffix: "p" },
  long:  { label: "Banner (920×430)",     dimensions: { width: 920, height: 430 },  fileSuffix: "" },
  hero:  { label: "Hero (1920×620)",      dimensions: { width: 1920, height: 620 }, fileSuffix: "_hero" },
  logo:  { label: "Logo (960×540)",       dimensions: { width: 960, height: 540 },  fileSuffix: "_logo" },
  icon:  { label: "Icon (600×600)",       dimensions: { width: 600, height: 600 },  fileSuffix: "_icon" },
};

export interface SGDBGame {
  id: number;
  name: string;
  release_date?: number;
  types?: string[];
}

export interface SGDBArtwork {
  id: number;
  url: string;
  thumb: string;
  author: { name: string };
  width: number;
  height: number;
}

export class ArtworkProvider {
  private client: InstanceType<typeof SGDB>;

  constructor(apiKey: string) {
    this.client = new SGDB({ key: apiKey });
  }

  /** Search SteamGridDB for games matching a title. */
  async searchGames(title: string): Promise<SGDBGame[]> {
    try {
      const encoded = title.replace(/\+/g, "%2B");
      const results = await this.client.searchGame(encoded);
      return results.map((g: any) => ({
        id: g.id,
        name: g.name,
        release_date: g.release_date,
        types: g.types,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fuzzy-search: search SGDB then rank results by similarity to the input title.
   * Returns games sorted best-match-first.
   */
  async fuzzySearchGames(title: string): Promise<SGDBGame[]> {
    const games = await this.searchGames(title);
    if (games.length <= 1) return games;

    const ranked = fuzzysort.go(title, games, {
      key: "name",
      threshold: 0.3,
    });
    return ranked.map((r) => r.obj);
  }

  /** Fetch artwork URLs for a specific game and artwork type. */
  async getArtwork(gameId: number, type: ArtworkType): Promise<SGDBArtwork[]> {
    try {
      const params: any = { id: gameId, type: "game", nsfw: "false", humor: "false" };
      let results: any[];

      switch (type) {
        case "tall":
          results = await this.client.getGrids({ ...params, dimensions: ["600x900"] });
          break;
        case "long":
          results = await this.client.getGrids({ ...params, dimensions: ["460x215", "920x430"] });
          break;
        case "hero":
          results = await this.client.getHeroes(params);
          break;
        case "logo":
          results = await this.client.getLogos(params);
          break;
        case "icon":
          results = await this.client.getIcons(params);
          break;
      }

      return results
        .filter((r: any) => !r.url.endsWith("?")) // DMCA filter
        .map((r: any) => ({
          id: r.id,
          url: r.url,
          thumb: r.thumb,
          author: { name: r.author?.name || "Unknown" },
          width: r.width,
          height: r.height,
        }));
    } catch {
      return [];
    }
  }
}
