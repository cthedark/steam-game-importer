/**
 * Stop and start the Steam process on Linux.
 * Ported from steam-rom-manager.
 */

import { execSync, spawn } from "child_process";

const CHECK_DELAY = 500;
const TIMEOUT = 30_000;

/** Check if Steam is currently running. */
export function isSteamRunning(): boolean {
  try {
    const result = execSync("pidof steam", { encoding: "utf8" }).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

/** Kill the Steam process and wait for it to exit. */
export async function stopSteam(): Promise<boolean> {
  if (!isSteamRunning()) return false;

  return new Promise((resolve, reject) => {
    const proc = spawn("kill", ["-15", execSync("pidof steam", { encoding: "utf8" }).trim()]);
    proc.on("close", () => {
      let elapsed = 0;
      const interval = setInterval(() => {
        if (!isSteamRunning()) {
          clearInterval(interval);
          // Small safety delay for file locks to release
          setTimeout(() => resolve(true), 1000);
          return;
        }
        elapsed += CHECK_DELAY;
        if (elapsed > TIMEOUT) {
          clearInterval(interval);
          reject(new Error("Timed out waiting for Steam to stop"));
        }
      }, CHECK_DELAY);
    });
  });
}

/** Start Steam in the background. */
export function startSteam(): void {
  spawn("nohup", ["steam"], {
    detached: true,
    stdio: "ignore",
  }).unref();
}
