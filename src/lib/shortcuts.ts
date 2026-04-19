/**
 * Read/write Steam shortcuts.vdf for non-Steam game entries.
 * Ported and simplified from steam-rom-manager's VDF_ShortcutsFile.
 */

import * as fs from "fs-extra";
import * as path from "path";
import { generateAppId, generateShortcutId } from "./app-id.js";

// steam-shortcut-editor is CJS-only but pure JS (no native addons).
// We import it as a namespace — esbuild will bundle it when building for pkg.
// In ESM mode (dev/start), Node resolves CJS modules via this import form.
import * as shortcutsParser from "steam-shortcut-editor";

export interface ShortcutEntry {
  appid: number;
  appname: string;
  exe: string;
  StartDir: string;
  LaunchOptions: string;
  icon: string;
  tags: string[];
}

export class ShortcutsFile {
  private fileData: { shortcuts: ShortcutEntry[] } | undefined;
  private indexMap: Map<string, number> = new Map();

  constructor(private filepath: string) {}

  get shortcuts(): ShortcutEntry[] | undefined {
    return this.fileData?.shortcuts;
  }

  get valid(): boolean {
    return this.fileData !== undefined && this.fileData.shortcuts !== undefined;
  }

  /** Read and index the shortcuts.vdf file. Creates empty structure if missing. */
  async read(): Promise<ShortcutEntry[]> {
    let buffer: Buffer | undefined;
    try {
      buffer = await fs.readFile(this.filepath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
      // File doesn't exist yet — that's fine
    }

    if (buffer && buffer.length > 0) {
      this.fileData = shortcutsParser.parseBuffer(buffer) || {};
    } else {
      this.fileData = {} as any;
    }

    if (!this.fileData!.shortcuts) {
      this.fileData!.shortcuts = [];
    }

    // Build index
    this.indexMap.clear();
    for (let i = 0; i < this.fileData!.shortcuts.length; i++) {
      const s = this.fileData!.shortcuts[i];
      const appId = generateAppId(s.exe, s.appname);
      this.indexMap.set(appId, i);
    }

    return this.fileData!.shortcuts;
  }

  /** Write the shortcuts back to disk. Ensures parent directory exists. */
  async write(): Promise<void> {
    if (!this.valid) throw new Error("Cannot write invalid shortcuts data");
    const data = shortcutsParser.writeBuffer(this.fileData);
    await fs.ensureDir(path.dirname(this.filepath));
    await fs.writeFile(this.filepath, data);
  }

  /** Backup the current file before modifying. */
  async backup(): Promise<void> {
    if (await fs.pathExists(this.filepath)) {
      const backupPath = this.filepath + ".bak";
      await fs.copy(this.filepath, backupPath, { overwrite: true });
    }
  }

  /** Check if a shortcut with this app ID already exists. */
  has(exe: string, appname: string): boolean {
    return this.indexMap.has(generateAppId(exe, appname));
  }

  /** Add a new shortcut entry. Returns the generated app ID. */
  add(entry: Omit<ShortcutEntry, "appid">): string {
    if (!this.valid) throw new Error("Must read() before adding entries");

    const appId = generateAppId(entry.exe, entry.appname);
    if (this.indexMap.has(appId)) {
      throw new Error(`Shortcut already exists for "${entry.appname}"`);
    }

    const fullEntry: ShortcutEntry = {
      ...entry,
      appid: generateShortcutId(entry.exe, entry.appname),
    };

    this.fileData!.shortcuts.push(fullEntry);
    this.indexMap.set(appId, this.fileData!.shortcuts.length - 1);
    return appId;
  }
}
