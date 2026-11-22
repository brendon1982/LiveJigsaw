# Live Jigsaw

Live Jigsaw is a Phaser 4 jigsaw game with RexUI controls. Each puzzle samples one shared texture from an autonomous Phaser scene.

## Where changes belong

- [Domain](src/domain) owns board dimensions, the grid and cut geometry, piece identities, snapping, and completion. Keep it independent of Phaser, RexUI, and the DOM. Put state transitions on the domain entities and use value objects when they make coordinates or rules clearer.
- [UI](src/ui) owns layout, input, and presentation. Convert pointer positions to board coordinates before submitting a drop to the domain. Read progress from the puzzle. Reuse the RexUI button and board components when extending a screen.
- [Rendering](src/rendering/LivePuzzleCapture.ts) owns source scene startup and shutdown, texture capture, and the direct camera comparison. Remove callbacks and owned textures on shutdown so returning to the picker and reopening a puzzle works.
- [Sources](src/sources) own their artwork, assets, and animation. Add a typed registration to [catalog.ts](src/sources/catalog.ts) using [PuzzleSource.ts](src/sources/PuzzleSource.ts). The registration supplies a normal Phaser scene class with a stable key and a picker preview. The host passes the logical viewport as scene data. Draw from its top-left corner and leave input, capture, and camera setup to the host.

Keep extensions small. Add board layouts and cut rules to the domain when a concrete game mode requires them. Keep a specific TODO next to any prototype assumption that blocks that work. Register new sources directly in the catalog.

## Rendering details

- Keep board geometry in logical pixels. Scale texture frame coordinates at the capture boundary and display pieces at their logical sizes. The 2× render target and linear filtering smooth geometry rendered to Phaser's single-sample framebuffer.
- Use named texture frames. Phaser treats numeric frame `0` as an omitted frame and falls back to the first registered frame.
- Capture after scene updates. Direct comparison uses the source scene's camera and pauses capture. Switching views should preserve the current puzzle.

## Verification

- Run `pnpm test` for the Phaser-free domain suite. Build cases with [givenPuzzle](tests/domain/puzzleScenario.mjs) and express actions in terms of pieces, targets, and drop outcomes. Keep assertions focused on domain behavior. Domain modules run directly under Node's TypeScript type stripping, so keep runtime imports explicit with `.ts` extensions and use erasable TypeScript syntax.
- Run `pnpm check` for type checking. Run `pnpm test:browser` for changes to rendering, scene lifecycle, or drag wiring. It builds the app and runs the Chrome smoke test. Set `LIVE_JIGSAW_BROWSER=msedge` to use Edge.
- Use the browser test for things that need Phaser or WebGL. Cover puzzle-rule combinations in the domain suite. Keep test code under `tests/` and generated files out of `node_modules`.
