/**
 * Detect Steam installation directories on Linux.
 */

import * as fs from "fs-extra";
import * as path from "path";
import { homedir } from "os";

const COMMON_STEAM_DIRS = [
  path.join(homedir(), ".steam", "steam"),
  path.join(homedir(), ".local", "share", "Steam"),
  path.join(homedir(), ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
  path.join(homedir(), "snap", "steam", "common", ".local", "share", "Steam"),
];

/**
 * Returns the first valid Steam installation directory found,
 * or null if none exists.
 */
export async function findSteamDirectory(): Promise<string | null> {
  for (const dir of COMMON_STEAM_DIRS) {
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) {
        // Verify it looks like a real Steam dir
        const configDir = path.join(dir, "config");
        if (await fs.pathExists(configDir)) {
          return dir;
        }
      }
    } catch {
      // not found, try next
    }
  }
  return null;
}

/** Path to shortcuts.vdf for a given Steam dir and account ID. */
export function shortcutsVdfPath(steamDir: string, accountId: string): string {
  return path.join(steamDir, "userdata", accountId, "config", "shortcuts.vdf");
}

/** Path to the grid artwork directory for a given Steam dir and account ID. */
export function gridDirectory(steamDir: string, accountId: string): string {
  return path.join(steamDir, "userdata", accountId, "config", "grid");
}

/** Path to Steam's main config.vdf (stores CompatToolMapping, etc.) */
export function configVdfPath(steamDir: string): string {
  return path.join(steamDir, "config", "config.vdf");
}
