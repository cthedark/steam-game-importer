/**
 * Persistent JSON config stored at ~/.config/steam-game-importer/config.json
 */

import * as fs from "fs-extra";
import * as path from "path";
import { homedir } from "os";

const CONFIG_DIR = path.join(homedir(), ".config", "steam-game-importer");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface AppConfig {
  steamGridDbApiKey?: string;
}

const DEFAULTS: AppConfig = {};

/** Load config from disk, returning defaults if missing or corrupt. */
export async function loadConfig(): Promise<AppConfig> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const raw = await fs.readFile(CONFIG_FILE, "utf8");
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {
    // Corrupt file — start fresh
  }
  return { ...DEFAULTS };
}

/** Save config to disk. Merges with existing values. */
export async function saveConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig();
  const merged = { ...current, ...updates };
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}

/** Get the config file path (for display to the user). */
export function configPath(): string {
  return CONFIG_FILE;
}
