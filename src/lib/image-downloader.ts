/**
 * Download images from URLs and save them to Steam's grid directory.
 */

import * as fs from "fs-extra";
import * as path from "path";
import fetch from "node-fetch";
import { ArtworkType, ARTWORK_META } from "./artwork.js";

/** Extract file extension from a URL. */
function extFromUrl(url: string): string {
  const raw = url.split(".").pop()?.replace(/[^\w]/g, "") || "png";
  // Normalize common extensions
  const map: Record<string, string> = { jpg: "jpg", jpeg: "jpg", png: "png", webp: "webp", ico: "ico" };
  return map[raw.toLowerCase()] || raw;
}

/** Extract file extension from a local file path. */
function extFromPath(filePath: string): string {
  const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
  const map: Record<string, string> = { jpg: "jpg", jpeg: "jpg", png: "png", webp: "webp", ico: "ico", bmp: "bmp", tga: "tga" };
  return map[ext] || ext || "png";
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tga", "ico", "gif"]);

/** Check if a file path looks like a supported image. */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Download an image from a URL and save it to disk.
 * Retries up to `retries` times on failure.
 */
async function downloadImage(url: string, destPath: string, retries = 3): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, buffer);
      return;
    } catch (err: any) {
      lastError = err;
      // Brief backoff
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export interface ArtworkSelection {
  type: ArtworkType;
  /** Remote URL or local file path */
  url: string;
  /** If true, `url` is a local file path to copy instead of download */
  isLocal?: boolean;
}

/**
 * Download selected artwork images into Steam's grid directory.
 * Files are named: `{shortAppId}{suffix}.{ext}`
 *
 * Supports both remote URLs and local file paths (when isLocal is true).
 *
 * @returns Array of saved file paths.
 */
export async function saveArtwork(
  gridDir: string,
  shortAppId: string,
  selections: ArtworkSelection[]
): Promise<string[]> {
  await fs.ensureDir(gridDir);
  const saved: string[] = [];

  for (const sel of selections) {
    const meta = ARTWORK_META[sel.type];
    const ext = sel.isLocal ? extFromPath(sel.url) : extFromUrl(sel.url);
    const filename = `${shortAppId}${meta.fileSuffix}.${ext}`;
    const destPath = path.join(gridDir, filename);

    try {
      // Remove any existing artwork for this type (different extension)
      const existing = await fs.readdir(gridDir);
      const prefix = `${shortAppId}${meta.fileSuffix}.`;
      for (const file of existing) {
        if (file.startsWith(prefix) && !file.endsWith(".json")) {
          await fs.remove(path.join(gridDir, file));
        }
      }

      if (sel.isLocal) {
        await fs.copy(sel.url, destPath, { overwrite: true });
      } else {
        await downloadImage(sel.url, destPath);
      }
      saved.push(destPath);
    } catch (err: any) {
      console.error(`  Failed to save ${meta.label}: ${err.message}`);
    }
  }

  return saved;
}
