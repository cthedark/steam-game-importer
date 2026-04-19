/**
 * Discover Steam user accounts from loginusers.vdf and userdata/.
 * Ported from steam-rom-manager.
 */

import * as fs from "fs-extra";
import * as path from "path";
import { glob } from "glob";
import * as vdf from "@node-steam/vdf";
import { steamID64ToAccountID } from "./steam-id.js";

export interface SteamUser {
  steamID64: string;
  accountID: string;
  name: string;
}

/**
 * Reads loginusers.vdf and scans userdata/ to find all Steam accounts
 * associated with a Steam installation directory.
 */
export async function getAvailableUsers(steamDirectory: string): Promise<SteamUser[]> {
  const usersFile = path.join(steamDirectory, "config", "loginusers.vdf");
  let userAccounts: SteamUser[] = [];

  // Parse loginusers.vdf
  try {
    if (await fs.pathExists(usersFile)) {
      const raw = await fs.readFile(usersFile, "utf8");
      const parsed = vdf.parse(raw) as any;
      if (parsed.users) {
        for (const steamID64 of Object.keys(parsed.users)) {
          userAccounts.push({
            steamID64,
            accountID: steamID64ToAccountID(steamID64),
            name: parsed.users[steamID64].AccountName || parsed.users[steamID64].PersonaName || "Unknown",
          });
        }
      }
    }
  } catch {
    // Silently continue — we'll still scan userdata/
  }

  // Scan userdata/ for any accounts not in loginusers.vdf
  try {
    const userdataDirs = await glob("userdata/+([0-9])/", { cwd: steamDirectory });
    const knownAccountIds = new Set(userAccounts.map((u) => u.accountID));

    for (const dir of userdataDirs) {
      const accountId = dir.split(path.sep).filter(Boolean).pop()!;
      if (accountId !== "0" && !knownAccountIds.has(accountId)) {
        userAccounts.push({
          steamID64: "",
          accountID: accountId,
          name: `Account ${accountId}`,
        });
      }
    }
  } catch {
    // ignore glob errors
  }

  return userAccounts;
}
