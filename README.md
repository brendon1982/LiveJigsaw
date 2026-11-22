# Live Jigsaw

A browser jigsaw prototype built around live, self-running Phaser 4 scenes. Choose **Windmill** or **Lighthouse** on the RexUI puzzle picker. The play scene launches the chosen input-free source and renders its display list to one shared `DynamicTexture`. Eight draggable pieces sample that texture through static masks and snap into place on the board.

In the play scene, **Dynamic texture** and **Direct Phaser** show the same animated scene at 512 × 288. The direct view draws the source through its own Phaser camera with texture capture paused. Select **Puzzle** to return to the board without losing progress, or **All puzzles** to choose another scene.

Phaser's WebGL dynamic texture uses a single-sample framebuffer. The puzzle renders to a 1024 × 576 target and samples it with linear filtering at half size to smooth geometry edges.

## Local development

Use Node.js 22.12 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Run `pnpm check` for type checking, `pnpm build` for the production build, and `pnpm preview` to serve that build locally.

Run `pnpm test:browser` with Google Chrome installed to verify the texture preview in a headless browser. Set `LIVE_JIGSAW_BROWSER=msedge` to use Microsoft Edge.
