#!/usr/bin/env node
/**
 * Steam Game Importer — Wizard-style CLI
 *
 * Walks you through importing a single non-Steam game into your
 * Steam library, complete with artwork from SteamGridDB.
 */

import chalk from "chalk";
import inquirer from "inquirer";
import * as path from "path";
import * as fs from "fs-extra";
import {
  findSteamDirectory,
  getAvailableUsers,
  shortcutsVdfPath,
  gridDirectory,
  ShortcutsFile,
  ArtworkProvider,
  ARTWORK_TYPES,
  ARTWORK_META,
  generateShortAppId,
  saveArtwork,
  isImageFile,
  isSteamRunning,
  stopSteam,
  startSteam,
  getInstalledProtonVersions,
  setCompatToolMapping,
  getInstalledEmulators,
  buildEmulatorLaunchCommand,
  titleFromRomFilename,
  loadConfig,
  saveConfig,
  configPath,
} from "./lib/index.js";
import type { SteamUser, SGDBGame, SGDBArtwork, ArtworkType, ArtworkSelection, ProtonVersion, EmulatorDef } from "./lib/index.js";

// ─── Helpers ────────────────────────────────────────────────────────

function banner() {
  console.log();
  console.log(chalk.cyan.bold("  ╔══════════════════════════════════════╗"));
  console.log(chalk.cyan.bold("  ║      Steam Game Importer Wizard     ║"));
  console.log(chalk.cyan.bold("  ╚══════════════════════════════════════╝"));
  console.log();
}

function stepHeader(step: number, total: number, title: string) {
  console.log();
  console.log(chalk.yellow(`  Step ${step}/${total}: ${title}`));
  console.log(chalk.gray("  " + "─".repeat(40)));
}

// ─── Wizard Steps ───────────────────────────────────────────────────

async function stepDetectSteam(): Promise<string> {
  const detected = await findSteamDirectory();

  if (detected) {
    console.log(chalk.green(`  Found Steam at: ${detected}`));
    const { useDetected } = await inquirer.prompt([{
      type: "confirm",
      name: "useDetected",
      message: "Use this Steam directory?",
      default: true,
    }]);
    if (useDetected) return detected;
  } else {
    console.log(chalk.yellow("  Could not auto-detect Steam installation."));
  }

  const { customDir } = await inquirer.prompt([{
    type: "input",
    name: "customDir",
    message: "Enter your Steam directory path:",
    validate: async (input: string) => {
      if (!input.trim()) return "Path cannot be empty";
      if (!(await fs.pathExists(input))) return "Directory does not exist";
      if (!(await fs.pathExists(path.join(input, "config")))) {
        return "Does not look like a Steam directory (missing config/)";
      }
      return true;
    },
  }]);
  return customDir;
}

async function stepSelectUser(steamDir: string): Promise<SteamUser> {
  const users = await getAvailableUsers(steamDir);

  if (users.length === 0) {
    throw new Error("No Steam user accounts found. Have you logged in to Steam at least once?");
  }

  if (users.length === 1) {
    console.log(chalk.green(`  Using account: ${users[0].name} (${users[0].accountID})`));
    return users[0];
  }

  const { selectedUser } = await inquirer.prompt([{
    type: "list",
    name: "selectedUser",
    message: "Select a Steam account:",
    choices: users.map((u) => ({
      name: `${u.name} (ID: ${u.accountID})`,
      value: u,
    })),
  }]);
  return selectedUser;
}

type GameType = "standalone" | "emulator";

interface GameDetails {
  appname: string;
  exe: string;
  startDir: string;
  launchOptions: string;
  tags: string[];
  gameType: GameType;
}

async function stepGameType(): Promise<GameType> {
  const { gameType } = await inquirer.prompt([{
    type: "list",
    name: "gameType",
    message: "What type of game are you adding?",
    choices: [
      { name: "Standalone executable (native Linux or Windows game)", value: "standalone" },
      { name: "ROM / Retro game (launched via emulator)", value: "emulator" },
    ],
  }]);
  return gameType;
}

async function stepEmulatorGameDetails(): Promise<GameDetails> {
  // Scan for emulators
  console.log(chalk.gray("  Scanning for installed emulators..."));
  const emulators = await getInstalledEmulators();

  if (emulators.length === 0) {
    console.log(chalk.yellow("  No supported emulators found."));
    console.log(chalk.gray("  Falling back to manual configuration."));
    return stepStandaloneGameDetails();
  }

  console.log(chalk.green(`  Found ${emulators.length} emulator(s)`));

  const { emulator } = await inquirer.prompt([{
    type: "list",
    name: "emulator",
    message: "Select emulator:",
    choices: emulators.map((e) => ({
      name: `${e.name} — ${e.systems.join(", ")}`,
      value: e,
    })),
  }]);

  // RetroArch needs a core path
  let retroarchCorePath: string | undefined;
  if (emulator.name.startsWith("RetroArch")) {
    const { corePath } = await inquirer.prompt([{
      type: "input",
      name: "corePath",
      message: "Path to RetroArch core (.so file):",
      validate: async (v: string) => {
        if (!v.trim()) return "Core path is required for RetroArch";
        if (!(await fs.pathExists(v))) return "Core file does not exist";
        return true;
      },
    }]);
    retroarchCorePath = corePath.trim();
  }

  const { romPath } = await inquirer.prompt([{
    type: "input",
    name: "romPath",
    message: "Path to ROM file:",
    validate: async (v: string) => {
      if (!v.trim()) return "ROM path is required";
      if (!(await fs.pathExists(v))) return "File does not exist";
      return true;
    },
  }]);

  const suggestedTitle = titleFromRomFilename(romPath.trim());

  const { appname } = await inquirer.prompt([{
    type: "input",
    name: "appname",
    message: "Game title:",
    default: suggestedTitle,
    validate: (v: string) => v.trim().length > 0 || "Title is required",
  }]);

  const { tags } = await inquirer.prompt([{
    type: "input",
    name: "tags",
    message: "Steam categories/tags (comma-separated, optional):",
    default: emulator.systems[0] || "",
  }]);

  const launch = buildEmulatorLaunchCommand(
    emulator as EmulatorDef,
    romPath.trim(),
    retroarchCorePath
  );

  return {
    appname: appname.trim(),
    exe: launch.exe,
    startDir: launch.startDir,
    launchOptions: launch.launchOptions,
    tags: tags
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean),
    gameType: "emulator",
  };
}

async function stepStandaloneGameDetails(): Promise<GameDetails> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "appname",
      message: "Game title:",
      validate: (v: string) => v.trim().length > 0 || "Title is required",
    },
    {
      type: "input",
      name: "exe",
      message: "Path to executable:",
      validate: async (v: string) => {
        if (!v.trim()) return "Executable path is required";
        if (!(await fs.pathExists(v))) return "File does not exist";
        return true;
      },
    },
    {
      type: "input",
      name: "startDir",
      message: "Start-in directory (leave blank to use exe directory):",
      default: "",
    },
    {
      type: "input",
      name: "launchOptions",
      message: "Launch options (optional):",
      default: "",
    },
    {
      type: "input",
      name: "tags",
      message: "Steam categories/tags (comma-separated, optional):",
      default: "",
    },
  ]);

  const exe = answers.exe.trim();
  return {
    appname: answers.appname.trim(),
    exe: `"${exe}"`,
    startDir: answers.startDir.trim() || `"${path.dirname(exe)}"`,
    launchOptions: answers.launchOptions.trim(),
    tags: answers.tags
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean),
    gameType: "standalone" as GameType,
  };
}

async function stepSearchArtwork(
  provider: ArtworkProvider,
  gameTitle: string
): Promise<SGDBGame | null> {
  console.log(chalk.gray(`  Searching SteamGridDB for "${gameTitle}"...`));
  const games = await provider.fuzzySearchGames(gameTitle);

  if (games.length === 0) {
    console.log(chalk.yellow("  No games found on SteamGridDB."));
    const { retry } = await inquirer.prompt([{
      type: "confirm",
      name: "retry",
      message: "Try a different search term?",
      default: true,
    }]);
    if (retry) {
      const { term } = await inquirer.prompt([{
        type: "input",
        name: "term",
        message: "Search term:",
      }]);
      return stepSearchArtwork(provider, term);
    }
    return null;
  }

  const { selectedGame } = await inquirer.prompt([{
    type: "list",
    name: "selectedGame",
    message: "Select the correct game:",
    choices: [
      ...games.slice(0, 15).map((g) => ({
        name: g.name,
        value: g,
      })),
      new inquirer.Separator(),
      { name: "None of these / Skip artwork", value: null },
    ],
  }]);

  return selectedGame;
}

async function stepSelectArtwork(
  provider: ArtworkProvider,
  game: SGDBGame
): Promise<ArtworkSelection[]> {
  const selections: ArtworkSelection[] = [];

  for (const artType of ARTWORK_TYPES) {
    const meta = ARTWORK_META[artType];
    console.log(chalk.gray(`  Fetching ${meta.label} artwork...`));
    const artworks = await provider.getArtwork(game.id, artType);

    if (artworks.length === 0) {
      console.log(chalk.yellow(`  No ${meta.label} artwork available on SteamGridDB.`));
      const localSel = await promptLocalImageForType(artType);
      if (localSel) selections.push(localSel);
      continue;
    }

    const { selected } = await inquirer.prompt([{
      type: "list",
      name: "selected",
      message: `Choose ${meta.label} (${artworks.length} available):`,
      choices: [
        ...artworks.slice(0, 10).map((a, i) => ({
          name: `#${i + 1} by ${a.author.name} (${a.width}×${a.height})`,
          value: a,
        })),
        new inquirer.Separator(),
        { name: "Use a local image file instead", value: "local" },
        { name: "Skip this artwork type", value: null },
      ],
    }]);

    if (selected === "local") {
      const localSel = await promptLocalImageForType(artType);
      if (localSel) selections.push(localSel);
    } else if (selected) {
      selections.push({ type: artType, url: selected.url });
    }
  }

  return selections;
}

/** Prompt the user for a local image file for a specific artwork type. */
async function promptLocalImageForType(artType: ArtworkType): Promise<ArtworkSelection | null> {
  const meta = ARTWORK_META[artType];
  const { filePath } = await inquirer.prompt([{
    type: "input",
    name: "filePath",
    message: `Path to local ${meta.label} image (or leave blank to skip):`,
    validate: async (v: string) => {
      if (!v.trim()) return true; // allow blank to skip
      if (!(await fs.pathExists(v.trim()))) return "File does not exist";
      if (!isImageFile(v.trim())) return "Not a recognized image format (png, jpg, webp, bmp, tga, ico, gif)";
      return true;
    },
  }]);

  if (!filePath.trim()) return null;
  return { type: artType, url: filePath.trim(), isLocal: true };
}

/**
 * Prompt the user to provide local image files for all artwork types.
 * Used when SteamGridDB is skipped entirely.
 */
async function stepLocalArtwork(): Promise<ArtworkSelection[]> {
  console.log(chalk.gray("  You can provide local image files for each artwork type."));
  console.log(chalk.gray("  Recommended sizes: Portrait 600×900, Banner 920×430, Hero 1920×620, Logo 960×540, Icon 600×600"));
  console.log();

  const selections: ArtworkSelection[] = [];

  for (const artType of ARTWORK_TYPES) {
    const sel = await promptLocalImageForType(artType);
    if (sel) selections.push(sel);
  }

  return selections;
}

async function stepSelectProton(
  steamDir: string
): Promise<ProtonVersion | null> {
  const { isWindowsGame } = await inquirer.prompt([{
    type: "confirm",
    name: "isWindowsGame",
    message: "Is this a Windows game that needs Proton/Wine to run?",
    default: false,
  }]);

  if (!isWindowsGame) return null;

  console.log(chalk.gray("  Scanning for installed Proton versions..."));
  const versions = await getInstalledProtonVersions(steamDir);

  if (versions.length === 0) {
    console.log(chalk.yellow("  No Proton versions found. You can set this later in Steam."));
    console.log(chalk.gray("  (Install Proton via Steam > Settings > Compatibility)"));
    return null;
  }

  const { selected } = await inquirer.prompt([{
    type: "list",
    name: "selected",
    message: `Select Proton version (${versions.length} found):`,
    choices: [
      ...versions.map((v) => ({
        name: v.displayName,
        value: v,
      })),
      new inquirer.Separator(),
      { name: "Skip — set it later in Steam", value: null },
    ],
  }]);

  return selected;
}

async function stepConfirmAndSave(
  steamDir: string,
  user: SteamUser,
  game: GameDetails,
  artworkSelections: ArtworkSelection[],
  protonVersion: ProtonVersion | null
): Promise<void> {
  console.log();
  console.log(chalk.cyan.bold("  Summary"));
  console.log(chalk.gray("  " + "─".repeat(40)));
  console.log(`  Title:          ${chalk.white.bold(game.appname)}`);
  console.log(`  Executable:     ${game.exe}`);
  console.log(`  Start in:       ${game.startDir}`);
  console.log(`  Launch options: ${game.launchOptions || "(none)"}`);
  console.log(`  Tags:           ${game.tags.length ? game.tags.join(", ") : "(none)"}`);
  console.log(`  Proton:         ${protonVersion ? chalk.magenta(protonVersion.displayName) : "(native Linux)"}`);
  const localCount = artworkSelections.filter((a) => a.isLocal).length;
  const remoteCount = artworkSelections.length - localCount;
  const artworkSummary = artworkSelections.length === 0
    ? "(none)"
    : [remoteCount && `${remoteCount} from SteamGridDB`, localCount && `${localCount} local`].filter(Boolean).join(", ");
  console.log(`  Artwork:        ${artworkSummary}`);
  console.log(`  Steam user:     ${user.name} (${user.accountID})`);
  console.log();

  const { confirm } = await inquirer.prompt([{
    type: "confirm",
    name: "confirm",
    message: "Add this game to Steam?",
    default: true,
  }]);

  if (!confirm) {
    console.log(chalk.yellow("  Cancelled."));
    return;
  }

  // Handle Steam process
  const steamWasRunning = isSteamRunning();
  if (steamWasRunning) {
    console.log(chalk.yellow("  Steam is running. It needs to be stopped to safely modify shortcuts."));
    const { stopIt } = await inquirer.prompt([{
      type: "confirm",
      name: "stopIt",
      message: "Stop Steam now?",
      default: true,
    }]);
    if (stopIt) {
      console.log(chalk.gray("  Stopping Steam..."));
      await stopSteam();
      console.log(chalk.green("  Steam stopped."));
    } else {
      console.log(chalk.yellow("  Proceeding anyway — categories may not be saved correctly."));
    }
  }

  // Write shortcut
  const vdfPath = shortcutsVdfPath(steamDir, user.accountID);
  const shortcuts = new ShortcutsFile(vdfPath);
  await shortcuts.read();
  await shortcuts.backup();

  const appId = shortcuts.add({
    appname: game.appname,
    exe: game.exe,
    StartDir: game.startDir,
    LaunchOptions: game.launchOptions,
    icon: "",
    tags: game.tags,
  });

  await shortcuts.write();
  console.log(chalk.green("  Shortcut saved to shortcuts.vdf"));

  // Download artwork
  if (artworkSelections.length > 0) {
    const gridDir = gridDirectory(steamDir, user.accountID);
    const shortAppId = generateShortAppId(
      game.exe,
      game.appname
    );
    console.log(chalk.gray("  Saving artwork..."));
    const saved = await saveArtwork(gridDir, shortAppId, artworkSelections);
    console.log(chalk.green(`  Saved ${saved.length} artwork file(s) to ${gridDir}`));
  }

  // Set Proton compatibility tool
  if (protonVersion) {
    const shortAppId = generateShortAppId(game.exe, game.appname);
    try {
      await setCompatToolMapping(steamDir, shortAppId, protonVersion.internalName);
      console.log(chalk.green(`  Proton set to ${protonVersion.displayName} in config.vdf`));
    } catch (err: any) {
      console.error(chalk.yellow(`  Warning: Could not set Proton version: ${err.message}`));
      console.log(chalk.gray("  You can set it manually in Steam → Properties → Compatibility"));
    }
  }

  // Offer to restart Steam
  if (steamWasRunning) {
    const { restart } = await inquirer.prompt([{
      type: "confirm",
      name: "restart",
      message: "Restart Steam?",
      default: true,
    }]);
    if (restart) {
      startSteam();
      console.log(chalk.green("  Steam is starting..."));
    }
  }

  console.log();
  console.log(chalk.green.bold("  Done! Your game has been added to Steam."));
  console.log(chalk.gray("  Restart Steam (if you haven't) to see it in your library."));
  console.log();
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const TOTAL_STEPS = 7;
  banner();

  try {
    // Step 1: Find Steam
    stepHeader(1, TOTAL_STEPS, "Detect Steam Installation");
    const steamDir = await stepDetectSteam();

    // Step 2: Select user
    stepHeader(2, TOTAL_STEPS, "Select Steam Account");
    const user = await stepSelectUser(steamDir);

    // Step 3: Game details
    stepHeader(3, TOTAL_STEPS, "Enter Game Details");
    const gameType = await stepGameType();
    const game = gameType === "emulator"
      ? await stepEmulatorGameDetails()
      : await stepStandaloneGameDetails();

    // Step 4: Proton / compatibility tool
    stepHeader(4, TOTAL_STEPS, "Proton Compatibility");
    const protonVersion = await stepSelectProton(steamDir);

    // Step 5: Search artwork
    stepHeader(5, TOTAL_STEPS, "Search for Artwork");
    const { artworkSource } = await inquirer.prompt([{
      type: "list",
      name: "artworkSource",
      message: "How would you like to add artwork?",
      choices: [
        { name: "Search SteamGridDB", value: "sgdb" },
        { name: "Use local image files", value: "local" },
        { name: "Skip artwork", value: "skip" },
      ],
    }]);

    let artworkSelections: ArtworkSelection[] = [];

    if (artworkSource === "sgdb") {
      const config = await loadConfig();
      let apiKey = config.steamGridDbApiKey || "";

      if (apiKey) {
        console.log(chalk.green(`  Using saved API key from ${configPath()}`));
      } else {
        const answer = await inquirer.prompt([{
          type: "input",
          name: "apiKey",
          message: "SteamGridDB API key (get one free at steamgriddb.com/profile/preferences/api):",
          validate: (v: string) => v.trim().length > 0 || "API key is required to fetch artwork",
        }]);
        apiKey = answer.apiKey.trim();
        await saveConfig({ steamGridDbApiKey: apiKey });
        console.log(chalk.gray(`  API key saved to ${configPath()}`));
      }

      const provider = new ArtworkProvider(apiKey);
      const sgdbGame = await stepSearchArtwork(provider, game.appname);

      // Step 6: Select artwork
      if (sgdbGame) {
        stepHeader(6, TOTAL_STEPS, "Choose Artwork");
        artworkSelections = await stepSelectArtwork(provider, sgdbGame);
      } else {
        // SGDB found nothing — offer local files as fallback
        console.log(chalk.yellow("  No game matched on SteamGridDB."));
        const { useLocal } = await inquirer.prompt([{
          type: "confirm",
          name: "useLocal",
          message: "Would you like to provide local image files instead?",
          default: true,
        }]);
        if (useLocal) {
          stepHeader(6, TOTAL_STEPS, "Choose Artwork (Local Files)");
          artworkSelections = await stepLocalArtwork();
        }
      }
    } else if (artworkSource === "local") {
      stepHeader(6, TOTAL_STEPS, "Choose Artwork (Local Files)");
      artworkSelections = await stepLocalArtwork();
    } else {
      console.log(chalk.gray("  Skipping artwork."));
    }

    // Step 7: Confirm and save
    stepHeader(7, TOTAL_STEPS, "Review & Save");
    await stepConfirmAndSave(steamDir, user, game, artworkSelections, protonVersion);
  } catch (err: any) {
    console.error(chalk.red(`\n  Error: ${err.message}`));
    process.exit(1);
  }
}

main();
