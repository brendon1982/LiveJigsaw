# Live Jigsaw

A browser jigsaw prototype built around live, self-running Phaser 4 scenes. Choose **Windmill** or **Lighthouse** in **Classic** (8 pieces) or **Large** (32 pieces). Each puzzle draws the source into one shared texture.

The play area fills the window. Scroll the piece tray with the mouse wheel, scrollbar, or by dragging empty space. Drag the divider to make room for more columns. Drag the board to bring any puzzle corner to the center of the board viewport. The faint live image and matching piece outlines guide placement.

Each source declares its maximum viewport. The engine uses it to offer puzzle sizes and decides whether to use 2× supersampling within the source and GPU texture limits. Both built-in sources support up to 1024 × 576, so Classic uses 2× capture and Large uses native resolution.

## Local development

Use Node.js 22.12 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Run `pnpm check` for type checking, `pnpm build` for the production build, and `pnpm preview` to serve that build locally.

Run `pnpm test` for fast puzzle-rule and geometry tests. Run `pnpm test:browser` with Google Chrome installed to verify scrolling, resizing, panning, and dragging. Set `LIVE_JIGSAW_BROWSER=msedge` to use Microsoft Edge.

## Reading the code

- [Domain](src/domain/Puzzle.ts) owns the board, piece outlines, drop rules, and completion.
- [Play scene](src/ui/PlayPuzzleScene.ts) coordinates the board UI, piece tray, and the selected source.
- [Capture adapter](src/rendering/LivePuzzleCapture.ts) owns the source lifecycle and the shared Phaser texture.
- [Source catalog](src/sources/catalog.ts) lists the built-in scenes. Add a scene class and a picker preview using the [source contract](src/sources/PuzzleSource.ts).
