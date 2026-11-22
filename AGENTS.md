# Live Jigsaw

Live Jigsaw is a Phaser 4 jigsaw game with RexUI controls. Each puzzle samples one shared texture from an autonomous Phaser scene.

## Code style

Prefer cohesive, readable, and simple code. Keep related behavior together, use names that reflect the game, and make the main flow easy to follow. Add an abstraction when it clarifies the code or serves a concrete need.

## Where changes belong

- [Domain](src/domain) owns board dimensions, the grid and cut geometry, piece identities, snapping, and completion. Keep it independent of Phaser, RexUI, and the DOM. Put state transitions on the domain entities and use value objects when they make coordinates or rules clearer.
- [UI](src/ui) owns layout, input, and presentation. Convert pointer positions to board coordinates before submitting a drop to the domain. Read progress from the puzzle. Reuse the RexUI button and board components when extending a screen.
- [Rendering](src/rendering/LivePuzzleCapture.ts) owns source scene startup and shutdown and texture capture. Remove callbacks and owned textures on shutdown so returning to the picker and reopening a puzzle works.
- [Sources](src/sources) own their artwork, assets, and animation. Add a typed registration to [catalog.ts](src/sources/catalog.ts) using [PuzzleSource.ts](src/sources/PuzzleSource.ts). The registration supplies a Phaser scene class with a stable key, a picker preview, and its maximum viewport. The host passes the chosen logical viewport as scene data. Draw from its top-left corner and leave input, capture, and camera setup to the host.

Keep extensions small. Add board layouts and cut rules to the domain when a concrete game mode requires them. Keep a specific TODO next to any prototype assumption that blocks that work. Register new sources directly in the catalog.

## Rendering details

- Keep board geometry in logical pixels. Scale texture frame coordinates at the capture boundary. Use 2× capture and linear filtering to smooth geometry when the source and GPU texture limits allow it.
- Use named texture frames. Phaser treats numeric frame `0` as an omitted frame and falls back to the first registered frame.
- Capture after scene updates. The board guide and pieces share the same live texture. The UI cameras clip the tray and board to their panels. Convert board drops to logical coordinates after accounting for pan.

## Verification

- Run `pnpm test` for the Phaser-free domain suite. Build cases with [givenPuzzle](tests/domain/puzzleScenario.mjs) and express actions in terms of pieces, targets, and drop outcomes. Keep assertions focused on domain behavior. Domain modules run directly under Node's TypeScript type stripping, so keep runtime imports explicit with `.ts` extensions and use erasable TypeScript syntax.
- Run `pnpm check` for type checking. Run `pnpm test:browser` for changes to rendering, scene lifecycle, or drag wiring. It builds the app and runs the Chrome smoke test. Set `LIVE_JIGSAW_BROWSER=msedge` to use Edge.
- Use the browser test for things that need Phaser or WebGL. Cover puzzle-rule combinations in the domain suite. Keep test code under `tests/` and generated files out of `node_modules`.
