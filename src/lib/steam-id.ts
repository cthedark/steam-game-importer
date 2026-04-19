/**
 * Steam ID conversion utilities.
 * Ported from steam-rom-manager.
 */

const STEAM_ID_64_IDENTIFIER = BigInt("0x0110000100000000");

export function steamID64ToAccountID(steamID64: string): string {
  return String(BigInt(steamID64) - STEAM_ID_64_IDENTIFIER);
}
