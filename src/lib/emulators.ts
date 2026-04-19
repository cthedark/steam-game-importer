/**
 * Emulator detection and ROM launch command building.
 *
 * Discovers common emulators installed on Linux (native + Flatpak)
 * and builds the correct executable + arguments for Steam shortcuts.
 */

import * as fs from "fs-extra";
import { execSync } from "child_process";
import * as path from "path";

export interface EmulatorDef {
  /** Display name shown in the wizard */
  name: string;
  /** The system/platform this emulator targets */
  systems: string[];
  /** Path to the executable (resolved at detection time) */
  exePath: string;
  /** Whether this is a Flatpak app */
  isFlatpak: boolean;
  /**
   * Template for building launch arguments.
   * Use {romPath} as placeholder for the ROM file path.
   * Use {corePath} for RetroArch core path.
   */
  argsTemplate: string;
}

interface EmulatorCandidate {
  name: string;
  systems: string[];
  /** Native binary paths to check */
  nativePaths: string[];
  /** Flatpak app ID */
  flatpakId?: string;
  /** Args template for native installs */
  nativeArgs: string;
  /** Args template for Flatpak installs (uses `flatpak run <id>` as exe) */
  flatpakArgs: string;
}

const EMULATOR_CANDIDATES: EmulatorCandidate[] = [
  // ── RetroArch (multi-system) ──
  {
    name: "RetroArch",
    systems: ["Multi-system (RetroArch)"],
    nativePaths: ["/usr/bin/retroarch", "/usr/local/bin/retroarch"],
    flatpakId: "org.libretro.RetroArch",
    nativeArgs: '-L "{corePath}" "{romPath}"',
    flatpakArgs: 'run org.libretro.RetroArch -L "{corePath}" "{romPath}"',
  },
  // ── Dolphin (GameCube / Wii) ──
  {
    name: "Dolphin",
    systems: ["Nintendo GameCube", "Nintendo Wii"],
    nativePaths: ["/usr/bin/dolphin-emu", "/usr/local/bin/dolphin-emu"],
    flatpakId: "org.DolphinEmu.dolphin-emu",
    nativeArgs: '-b -e "{romPath}"',
    flatpakArgs: 'run org.DolphinEmu.dolphin-emu -b -e "{romPath}"',
  },
  // ── PCSX2 (PlayStation 2) ──
  {
    name: "PCSX2",
    systems: ["Sony PlayStation 2"],
    nativePaths: ["/usr/bin/pcsx2-qt", "/usr/bin/pcsx2"],
    flatpakId: "net.pcsx2.PCSX2",
    nativeArgs: '"{romPath}"',
    flatpakArgs: 'run net.pcsx2.PCSX2 "{romPath}"',
  },
  // ── RPCS3 (PlayStation 3) ──
  {
    name: "RPCS3",
    systems: ["Sony PlayStation 3"],
    nativePaths: ["/usr/bin/rpcs3"],
    flatpakId: "net.rpcs3.RPCS3",
    nativeArgs: '--no-gui "{romPath}"',
    flatpakArgs: 'run net.rpcs3.RPCS3 --no-gui "{romPath}"',
  },
  // ── PPSSPP (PSP) ──
  {
    name: "PPSSPP",
    systems: ["Sony PSP"],
    nativePaths: ["/usr/bin/ppsspp", "/usr/bin/PPSSPPSDL"],
    flatpakId: "org.ppsspp.PPSSPP",
    nativeArgs: '"{romPath}"',
    flatpakArgs: 'run org.ppsspp.PPSSPP "{romPath}"',
  },
  // ── Cemu (Wii U) ──
  {
    name: "Cemu",
    systems: ["Nintendo Wii U"],
    nativePaths: ["/usr/bin/cemu"],
    flatpakId: "info.cemu.Cemu",
    nativeArgs: '-g "{romPath}"',
    flatpakArgs: 'run info.cemu.Cemu -g "{romPath}"',
  },
  // ── Yuzu / Suyu / Ryujinx (Switch) ──
  {
    name: "Ryujinx",
    systems: ["Nintendo Switch"],
    nativePaths: ["/usr/bin/ryujinx", "/usr/bin/Ryujinx"],
    flatpakId: "org.ryujinx.Ryujinx",
    nativeArgs: '"{romPath}"',
    flatpakArgs: 'run org.ryujinx.Ryujinx "{romPath}"',
  },
  // ── mGBA (Game Boy / GBA) ──
  {
    name: "mGBA",
    systems: ["Nintendo Game Boy", "Nintendo Game Boy Advance"],
    nativePaths: ["/usr/bin/mgba-qt", "/usr/bin/mgba"],
    flatpakId: "io.mgba.mGBA",
    nativeArgs: '-f "{romPath}"',
    flatpakArgs: 'run io.mgba.mGBA -f "{romPath}"',
  },
  // ── DeSmuME / melonDS (Nintendo DS) ──
  {
    name: "melonDS",
    systems: ["Nintendo DS"],
    nativePaths: ["/usr/bin/melonDS"],
    flatpakId: "net.kuribo64.melonDS",
    nativeArgs: '"{romPath}"',
    flatpakArgs: 'run net.kuribo64.melonDS "{romPath}"',
  },
  // ── Citra / Lime3DS (3DS) ──
  {
    name: "Lime3DS",
    systems: ["Nintendo 3DS"],
    nativePaths: ["/usr/bin/lime3ds", "/usr/bin/citra-qt"],
    flatpakId: "io.github.lime3ds.Lime3DS",
    nativeArgs: '"{romPath}"',
    flatpakArgs: 'run io.github.lime3ds.Lime3DS "{romPath}"',
  },
  // ── DuckStation (PlayStation 1) ──
  {
    name: "DuckStation",
    systems: ["Sony PlayStation"],
    nativePaths: ["/usr/bin/duckstation-qt"],
    flatpakId: "org.duckstation.DuckStation",
    nativeArgs: '"{romPath}"',
    flatpakArgs: 'run org.duckstation.DuckStation "{romPath}"',
  },
];

/** Check if a Flatpak app is installed. */
function isFlatpakInstalled(appId: string): boolean {
  try {
    const result = execSync(`flatpak info ${appId} 2>/dev/null`, { encoding: "utf8" });
    return result.length > 0;
  } catch {
    return false;
  }
}

/**
 * Scan the system for installed emulators.
 * Checks both native binary paths and Flatpak installations.
 */
export async function getInstalledEmulators(): Promise<EmulatorDef[]> {
  const found: EmulatorDef[] = [];

  for (const candidate of EMULATOR_CANDIDATES) {
    // Check native paths
    for (const nativePath of candidate.nativePaths) {
      if (await fs.pathExists(nativePath)) {
        found.push({
          name: candidate.name,
          systems: candidate.systems,
          exePath: nativePath,
          isFlatpak: false,
          argsTemplate: candidate.nativeArgs,
        });
        break; // Only add one native entry per emulator
      }
    }

    // Check Flatpak
    if (candidate.flatpakId && isFlatpakInstalled(candidate.flatpakId)) {
      found.push({
        name: `${candidate.name} (Flatpak)`,
        systems: candidate.systems,
        exePath: "/usr/bin/flatpak",
        isFlatpak: true,
        argsTemplate: candidate.flatpakArgs,
      });
    }
  }

  return found;
}

/**
 * Build the Steam shortcut exe and launch options for an emulator + ROM.
 *
 * SRM's pattern: when `appendArgsToExecutable` is true, the exe field
 * contains the full command line: `"/path/to/emulator" args "rompath"`.
 * This is what Steam expects for non-Steam shortcuts.
 */
export function buildEmulatorLaunchCommand(
  emulator: EmulatorDef,
  romPath: string,
  retroarchCorePath?: string
): { exe: string; launchOptions: string; startDir: string } {
  let args = emulator.argsTemplate
    .replace(/\{romPath\}/g, romPath)
    .replace(/\{corePath\}/g, retroarchCorePath || "");

  // SRM pattern: append args to executable for the exe field
  const exe = `"${emulator.exePath}" ${args}`;

  return {
    exe,
    launchOptions: "",
    startDir: `"${path.dirname(emulator.exePath)}"`,
  };
}

/**
 * Extract a clean game title from a ROM filename.
 * Strips extension and common ROM naming conventions like (USA), [!], etc.
 */
export function titleFromRomFilename(romPath: string): string {
  let name = path.basename(romPath, path.extname(romPath));

  // Remove common ROM tags: (USA), (Europe), [!], (Rev 1), (En,Fr), etc.
  name = name.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "");
  // Remove trailing whitespace and dashes
  name = name.replace(/[\s\-_]+$/, "");

  return name.trim();
}
