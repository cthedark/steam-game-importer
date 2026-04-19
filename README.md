# Steam Game Importer

A wizard-style CLI tool for Linux that imports a single non-Steam game into your Steam library, complete with artwork from [SteamGridDB](https://www.steamgriddb.com/).

Unlike batch tools like Steam ROM Manager, this focuses on importing **one game at a time** with a guided, step-by-step experience.

## Features

- Auto-detects Steam installation on Linux (native, Flatpak, Snap)
- Discovers Steam user accounts from `loginusers.vdf`
- Two game modes: standalone executables and emulator-launched ROMs
- Auto-detects installed emulators (RetroArch, Dolphin, PCSX2, RPCS3, and more)
- Builds correct emulator launch commands with ROM path injection
- Extracts clean game titles from ROM filenames
- Searches SteamGridDB for game artwork (portrait, banner, hero, logo, icon)
- Supports local image files as artwork (use your own images or mix with SteamGridDB)
- Falls back to local file prompts when SteamGridDB has no results
- Fuzzy-matches game titles for better search results
- Writes directly to Steam's `shortcuts.vdf` (with backup)
- Downloads and saves artwork to Steam's grid directory
- Sets Proton/compatibility tool version for Windows games via `config.vdf`
- Handles Steam process stop/restart

## Prerequisites

- Node.js 18+
- Steam installed on Linux
- A [SteamGridDB API key](https://www.steamgriddb.com/profile/preferences/api) (free)

## Install

### Arch Linux (AUR)

Using your preferred AUR helper:

```bash
yay -S steam-game-importer
```

Then run:

```bash
steam-game-importer
```

### Manual (any Linux with Node.js 18+)

```bash
git clone https://github.com/YOUR_USERNAME/steam-game-importer.git
cd steam-game-importer
npm install
npm run build
npm start
```

Or for development:

```bash
npm run dev
```

## Wizard Flow

1. **Detect Steam** — finds your Steam directory automatically
2. **Select Account** — picks which Steam user to add the game to
3. **Game Details** — choose standalone exe or emulator ROM, configure paths
4. **Proton Compatibility** — optionally set a Proton version for Windows games
5. **Search Artwork** — choose SteamGridDB, local image files, or skip
6. **Choose Artwork** — pick artwork per type (SteamGridDB results, local files, or mix both)
7. **Review & Save** — confirms and writes the shortcut + downloads artwork + sets Proton

## Project Structure

```
src/
├── index.ts                 # Wizard CLI entry point
└── lib/
    ├── index.ts             # Barrel exports
    ├── app-id.ts            # Steam app ID generation (CRC32)
    ├── artwork.ts           # SteamGridDB integration & artwork types
    ├── emulators.ts         # Emulator detection & ROM launch commands
    ├── image-downloader.ts  # Download & save artwork to grid dir
    ├── proton.ts            # Discover Proton versions & set compat tool
    ├── shortcuts.ts         # Read/write shortcuts.vdf
    ├── steam-id.ts          # Steam ID64 ↔ account ID conversion
    ├── steam-paths.ts       # Linux Steam directory detection
    ├── steam-process.ts     # Stop/start Steam process
    └── steam-users.ts       # Discover Steam user accounts
```

## Supported Emulators

The wizard auto-detects these emulators (both native and Flatpak installs):

| Emulator | Systems |
|----------|---------|
| RetroArch | Multi-system (requires core path) |
| Dolphin | GameCube, Wii |
| PCSX2 | PlayStation 2 |
| RPCS3 | PlayStation 3 |
| PPSSPP | PSP |
| DuckStation | PlayStation |
| Cemu | Wii U |
| Ryujinx | Switch |
| mGBA | Game Boy, Game Boy Advance |
| melonDS | Nintendo DS |
| Lime3DS | Nintendo 3DS |

## Credits

Core Steam integration logic ported from [Steam ROM Manager](https://github.com/SteamGridDB/steam-rom-manager).
