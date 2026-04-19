/**
 * Proton / Steam Play compatibility tool management.
 *
 * Discovers installed Proton versions and writes per-game compatibility
 * tool mappings into Steam's config/config.vdf.
 */

import * as fs from "fs-extra";
import * as path from "path";
import * as vdf from "@node-steam/vdf";
import { glob } from "glob";

export interface ProtonVersion {
  /** Internal name used in CompatToolMapping (e.g. "proton_9", "GE-Proton9-20") */
  internalName: string;
  /** Human-readable display name (e.g. "Proton 9.0-4", "GE-Proton9-20") */
  displayName: string;
  /** Path to the tool's installation directory */
  installPath: string;
}

/**
 * Scan for installed Proton/compatibility tools.
 *
 * Looks in two locations:
 *  1. Steam-managed: steamapps/common/ (official Proton builds)
 *  2. Custom:        compatibilitytools.d/ (GE-Proton, etc.)
 */
export async function getInstalledProtonVersions(steamDir: string): Promise<ProtonVersion[]> {
  const versions: ProtonVersion[] = [];

  const searchDirs = [
    path.join(steamDir, "compatibilitytools.d"),
    path.join(steamDir, "steamapps", "common"),
  ];

  for (const searchDir of searchDirs) {
    if (!(await fs.pathExists(searchDir))) continue;

    try {
      const manifests = await glob("*/compatibilitytool.vdf", { cwd: searchDir, absolute: true });

      for (const manifestPath of manifests) {
        try {
          const raw = await fs.readFile(manifestPath, "utf8");
          const parsed = vdf.parse(raw) as any;

          const tools = parsed?.compatibilitytools?.compat_tools;
          if (!tools) continue;

          for (const [internalName, toolData] of Object.entries<any>(tools)) {
            versions.push({
              internalName,
              displayName: toolData.display_name || internalName,
              installPath: path.dirname(manifestPath),
            });
          }
        } catch {
          // Skip unparseable manifests
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  // Sort: Proton Experimental first, then by name descending (newest first)
  versions.sort((a, b) => {
    if (a.internalName === "proton_experimental") return -1;
    if (b.internalName === "proton_experimental") return 1;
    return b.displayName.localeCompare(a.displayName, undefined, { numeric: true });
  });

  return versions;
}

/**
 * Write a compatibility tool mapping for a non-Steam shortcut into config.vdf.
 *
 * This is the equivalent of right-clicking a game in Steam →
 * Properties → Compatibility → "Force the use of a specific Steam Play
 * compatibility tool".
 *
 * @param steamDir  Root Steam directory
 * @param shortAppId  The 32-bit short app ID (from generateShortAppId)
 * @param protonName  Internal name of the Proton version (e.g. "proton_9")
 */
export async function setCompatToolMapping(
  steamDir: string,
  shortAppId: string,
  protonName: string
): Promise<void> {
  const configPath = path.join(steamDir, "config", "config.vdf");

  if (!(await fs.pathExists(configPath))) {
    throw new Error(`Steam config.vdf not found at ${configPath}`);
  }

  // Backup before modifying
  const backupPath = configPath + ".bak";
  await fs.copy(configPath, backupPath, { overwrite: true });

  const raw = await fs.readFile(configPath, "utf8");
  const config = vdf.parse(raw) as any;

  // Navigate to (or create) the CompatToolMapping section
  // Path: InstallConfigStore.Software.Valve.Steam.CompatToolMapping
  const steam = config?.InstallConfigStore?.Software?.Valve?.Steam;
  if (!steam) {
    throw new Error("Unexpected config.vdf structure — cannot find InstallConfigStore.Software.Valve.Steam");
  }

  if (!steam.CompatToolMapping) {
    steam.CompatToolMapping = {};
  }

  steam.CompatToolMapping[shortAppId] = {
    name: protonName,
    config: "",
    priority: "250",
  };

  const output = vdf.stringify(config);
  await fs.writeFile(configPath, output, "utf8");
}
