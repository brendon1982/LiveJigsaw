# Live Jigsaw

Live Jigsaw is a Phaser 4 jigsaw game with RexUI controls. Each puzzle samples one shared texture from an autonomous Phaser scene.

## Code style

Apply cohesion, readability, and simplicity at every level, from modules and classes down to functions, loops, and expressions.

- **Make the main flow easy to narrate.** When a function performs several meaningful steps, give those steps names through local variables, straightforward control flow, or focused helpers. A reader should be able to follow the main flow and then inspect the details they care about.
- **Keep the main flow at a consistent level of abstraction.** In a constructor or other setup flow, name the operations in domain terms. Extract a cohesive operation when following the flow would otherwise require reading its mechanics: for example, build puzzle pieces without exposing how cells pair with outlines, or initialize orientations without exposing the seed arithmetic. Keep direct assignments and simple collection setup inline when they already read as part of the flow.
- **Express the domain operation directly.** Choose names and control flow that reveal what the game is doing. For a grid built row by row, loops over `row` and `column` make the traversal visible. Use names like `cellWidth` when more than one kind of width is in scope.
- **Keep each step cohesive.** Group calculations and assembly that a reader naturally understands together. Extract a helper when it names a distinct rule or phase and makes sense on its own. Keep small, closely related steps together where the reader uses them.
- **Review for what the reader must infer.** After checking where the code belongs, read the implementation in execution order. Look for changing meanings, implicit ordering, coordinate conversions, and expressions that combine several steps. Make the important ones visible in the code.

## Where changes belong

- [Domain](src/domain) owns board dimensions, the grid and cut geometry, piece identities, snapping, and completion. Keep it independent of Phaser, RexUI, and the DOM. Put state transitions on the domain entities and use value objects when they make coordinates or rules clearer.
- [UI](src/ui) owns layout, input, and presentation. Convert pointer positions to board coordinates before submitting a drop to the domain. Read progress from the puzzle. Reuse the RexUI button and board components when extending a screen.
- Use `makeOptionTile` from [button.ts](src/ui/button.ts) for selectable dialog options. Use regular buttons for actions such as Play, Apply, and Done.
- [Rendering](src/rendering/LivePuzzleCapture.ts) owns source scene startup and shutdown and texture capture. Remove callbacks and owned textures on shutdown so returning to the picker and reopening a puzzle works.
- Each source in [puzzles](src/puzzles) has its own folder for its scene, artwork, assets, and animation. Export one entry per folder using [PuzzleSource.ts](src/puzzles/PuzzleSource.ts) and add it to [catalog.ts](src/puzzles/catalog.ts). The entry supplies a Phaser scene class with a stable key, a picker preview, and its maximum viewport. The host passes the chosen logical viewport as scene data. Draw from its top-left corner and leave input, capture, and camera setup to the host.

Keep extensions small. Add board layouts and cut rules to the domain when a concrete game mode requires them. Keep a specific TODO next to any prototype assumption that blocks that work.

## Save data

- Treat browser saves as live data. Keep the game model and save decoder on the current schema. When the stored shape changes, append a one-version transformation in [saveMigrations.ts](src/persistence/saveMigrations.ts). The pipeline increments the version after each step and runs before the current decoder.
- Keep each migration independent of Phaser, the browser, and current model defaults. Preserve unrelated settings, puzzle progress, and completion history. Version 0 represents imported standalone theme and filter settings.
- Write successfully migrated documents back in the current version. Keep unreadable or unsupported documents in storage and use session defaults when they cannot be loaded. Verify a migration with a save in the previous format that contains existing progress and history.
- Store tray sizes as separate fractions of the available split space for vertical and horizontal trays. Save on divider release and clamp for the current viewport during layout.

## Touch input

- Treat touch as a primary input. Keep the picker and play area usable in both tablet orientations. Give touch controls generous hit areas and make every essential action available without hover or a mouse wheel.
- A vertical swipe scrolls the tray, including when it starts on a piece. Rightward movement up to 70° above or below horizontal picks up a piece. Give scrolling a longer threshold so a small vertical movement can turn into a drag.
- One finger pans the board. Two fingers zoom about their midpoint. Convert drops through the current board pan and zoom before applying puzzle rules. A cancelled contact returns a lifted piece to the tray.
- Exercise touch paths with touch events in the browser suite. Cover gesture conflicts, cancellation, and placement after zooming alongside the desktop mouse path.

## Rendering details

- Keep board geometry, capture textures, and piece frames at the same logical pixel scale. Use linear filtering when sampling the live texture.
- Preserve artwork proportions when framing puzzle scenes. Crop rather than stretch to fill a different aspect ratio. Render raster artwork in source scenes at native size or downsample it; never upsample it to fill a viewport or make room for animation. This does not limit player-controlled board zoom.
- Use named texture frames. Phaser treats numeric frame `0` as an omitted frame and falls back to the first registered frame.
- Capture after scene updates. The board guide and pieces share the same live texture. The UI cameras clip the tray and board to their panels. Convert board drops to logical coordinates after accounting for pan.

## Verification

- Run `pnpm test` for the Phaser-free domain suite. Build cases with [givenPuzzle](tests/domain/puzzleScenario.mjs) and express actions in terms of pieces, targets, and drop outcomes. Keep assertions focused on domain behavior. Domain modules run directly under Node's TypeScript type stripping, so keep runtime imports explicit with `.ts` extensions and use erasable TypeScript syntax.
- Run `pnpm check` for type checking. Run `pnpm test:browser` for changes to rendering, scene lifecycle, or drag wiring. It builds the app and runs the Chrome smoke test. Set `LIVE_JIGSAW_BROWSER=msedge` to use Edge.
- Use the browser test for things that need Phaser or WebGL. Cover puzzle-rule combinations in the domain suite. Keep test code under `tests/` and generated files out of `node_modules`.
