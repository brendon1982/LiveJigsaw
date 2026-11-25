# Live Jigsaw

A browser jigsaw prototype built around live, self-running Phaser 4 scenes. Play any scene in **Classic** (8 pieces) or **Large** (32 pieces). Each puzzle draws the source into one shared texture.

The play area fills the window. Scroll the piece tray with the mouse wheel, scrollbar, or by dragging empty space. Drag the divider to make room for more columns. Drag the board to bring any puzzle corner to the center of the board viewport. The faint live image guides placement.

On a tablet, swipe vertically anywhere in the tray to scroll. Drag a piece to the right to pick it up. Drag the board with one finger to pan and pinch with two fingers to zoom.

Each source declares its maximum viewport. The engine uses it to offer puzzle sizes and decides whether to use 2× supersampling within the source and GPU texture limits. Both built-in sources support up to 1024 × 576, so Classic uses 2× capture and Large uses native resolution.

## Local development

Use Node.js 22.12 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Run `pnpm check` for type checking, `pnpm build` for the production build, and `pnpm preview` to serve that build locally.

Run `pnpm test` for fast puzzle-rule and geometry tests. Run `pnpm test:browser` with Google Chrome installed to verify scrolling, resizing, panning, and dragging. Set `LIVE_JIGSAW_BROWSER=msedge` to use Microsoft Edge.

### Preparing sprite atlases

Run `pnpm atlas:prepare input.png input.xml path/to/output.xml` to prepare a Phaser `TextureAtlas` XML sheet. The tool writes `output.xml` and `output.png` together. It repeats each frame's edge pixels into a two-pixel gutter so linear filtering can sample the edge without picking up a neighboring sprite's colors. The XML still describes the original frame dimensions.

Check in the prepared PNG and XML alongside the puzzle that uses them. You can run the tool on an already prepared sheet because it reads each frame from the rectangles in the XML.

## Reading the code

- [Domain](src/domain/Puzzle.ts) owns the board, piece outlines, drop rules, and completion.
- [Play scene](src/ui/PlayPuzzleScene.ts) coordinates the board UI, piece tray, and the selected source.
- [Capture adapter](src/rendering/LivePuzzleCapture.ts) owns the source lifecycle and the shared Phaser texture.
- [Source catalog](src/puzzles/catalog.ts) lists the built-in scenes. Keep each scene, its artwork, and its assets in its own folder under `src/puzzles`. Export an entry with the scene and picker preview using the [source contract](src/puzzles/PuzzleSource.ts).
