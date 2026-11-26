# Live Jigsaw

A browser jigsaw prototype built around live, self-running Phaser 4 scenes. Choose from sizes of 32, 64, 128, 288, or 392 pieces, depending on the scene. Each puzzle draws the source into one shared texture.

The play area fills the window. Scroll the piece tray with the mouse wheel, scrollbar, or by dragging empty space. Drag the divider to make room for more columns. Drag the board to bring any puzzle corner to the center of the board viewport. The faint live image guides placement.

On a tablet, swipe vertically anywhere in the tray to scroll. Drag a piece to the right to pick it up. Drag the board with one finger to pan and pinch with two fingers to zoom.

Each source declares its maximum viewport for new puzzles. The shared texture matches the board dimensions, subject to the GPU texture limit. Existing 8-piece puzzles can still be resumed.

## Local development

Use Node.js 22.12 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Run `pnpm check` for type checking, `pnpm build` for the production build, and `pnpm preview` to serve that build locally.

Run `pnpm test` for fast puzzle-rule and geometry tests. Run `pnpm test:browser` with Google Chrome installed to verify scrolling, resizing, panning, and dragging. Set `LIVE_JIGSAW_BROWSER=msedge` to use Microsoft Edge.
The browser suite runs up to eight scenarios at once. Set `LIVE_JIGSAW_BROWSER_CONCURRENCY=1` for a serial run.

### Preparing sprite atlases

Run `pnpm atlas:prepare input.png input.xml path/to/output.xml` to prepare a Phaser `TextureAtlas` XML sheet. The tool writes `output.xml` and `output.png` together. It repeats each frame's edge pixels into a two-pixel gutter so linear filtering can sample the edge without picking up a neighboring sprite's colors. The XML still describes the original frame dimensions.

Check in the prepared PNG and XML alongside the puzzle that uses them. You can run the tool on an already prepared sheet because it reads each frame from the rectangles in the XML.

### Deploying from Windows to Linux

Install `rsync` in a WSL Linux distribution and on the server (on Ubuntu or Debian, `sudo apt install rsync`). From that WSL distribution, connect with `ssh paperriver@your-server` once and verify the server's host-key fingerprint before accepting it. The script uses WSL's SSH config and known hosts, not Windows' OpenSSH settings. For a custom port, configure a host alias in WSL's `~/.ssh/config` and pass that alias as `-SshTarget`. Use `-Distribution Ubuntu` if Ubuntu isn't your default WSL distribution.

The script defaults to account `paperriver` and directory `/home/www/livejigsaw`. Make sure this **dedicated game directory** is writable by the account, replace `your-server` with the hostname or IP address, and run from an interactive PowerShell window:

```powershell
.\scripts\deploy.ps1 -SshTarget your-server
.\scripts\deploy.ps1 -SshTarget your-server -Apply
```

Both commands build the site locally, then SSH prompts for your password if the server allows password authentication. The script does not store the password. The first command previews changes without writing to the server; `*deleting` lines show which remote entries would be removed. The second checks again, uploads new or changed files by checksum, and removes entries that aren't in `dist`. To override the defaults, pass `-SshTarget user@host` or `-RemoteDirectory /path/to/game`. **Don't target a shared web root or keep server-only files in this directory.** Serve the game at the URL root of its site.

## Reading the code

- [Domain](src/domain/Puzzle.ts) owns the board, piece outlines, drop rules, and completion.
- [Play scene](src/ui/PlayPuzzleScene.ts) coordinates the board UI, piece tray, and the selected source.
- [Capture adapter](src/rendering/LivePuzzleCapture.ts) owns the source lifecycle and the shared Phaser texture.
- [Source catalog](src/puzzles/catalog.ts) lists the built-in scenes. Keep each scene, its artwork, and its assets in its own folder under `src/puzzles`. Export an entry with the scene and picker preview using the [source contract](src/puzzles/PuzzleSource.ts).
