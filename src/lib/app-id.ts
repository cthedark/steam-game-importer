/**
 * Steam non-Steam app ID generation.
 * Ported from steam-rom-manager.
 * Uses CRC32 of (exe + appname) to produce deterministic IDs.
 */

import crc from "crc";

function generatePreliminaryId(exe: string, appname: string): bigint {
  const key = exe + appname;
  const top = BigInt(crc.crc32(key)) | BigInt(0x80000000);
  return (top << BigInt(32)) | BigInt(0x02000000);
}

/** Full 64-bit app ID used for Big Picture grids and as primary key. */
export function generateAppId(exe: string, appname: string): string {
  return String(generatePreliminaryId(exe, appname));
}

/** 32-bit short app ID used for grid artwork filenames. */
export function generateShortAppId(exe: string, appname: string): string {
  return shortenAppId(generateAppId(exe, appname));
}

/** Signed 32-bit shortcut ID stored in shortcuts.vdf `appid` field. */
export function generateShortcutId(exe: string, appname: string): number {
  return Number(
    (generatePreliminaryId(exe, appname) >> BigInt(32)) - BigInt(0x100000000)
  );
}

export function shortenAppId(longId: string): string {
  return String(BigInt(longId) >> BigInt(32));
}

export function lengthenAppId(shortId: string): string {
  return String((BigInt(shortId) << BigInt(32)) | BigInt(0x02000000));
}
