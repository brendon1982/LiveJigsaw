# Live Jigsaw TODO

- [x] Save puzzle progress so players can leave a partially completed puzzle and resume it later.
- [ ] Add piece rotation option, when on pieces in the puzzle tray are randomly rotated. Tapping the piece rotates it in the tray.
- [ ] Add bigger puzzle size.
- [ ] Add badges to puzzle selection cards for completing at different sizes and in different challenge modes.
- [ ] Add unlockable effects that play when a piece is placed. Decide how players unlock them.
- [x] Add option to pick up piece without having to hold the left mouse button down. Maybe right or middle click.
- [ ] Consider adding more puzzle piece shapes.
- [ ] Consider allowing for pieces to be placed and assembled off the board. This would also have to allow for rotation when pieces are in this state.
- [x] Vary the shape of piece connectors and where they sit along each edge.
- [x] Add UI themes.
- [x] Add a loading screen.
- [x] Add colour filters for the image drawn on the board, such as black and white or sepia.
- [x] Add an animation speed setting with **Slow**, **Normal**, and **Fast** as part of the puzzle source contract. Each puzzle source must define how those speeds affect its animation.
- [x] Challenge modes e.g. pieces must be placed in a particular sequence, limited pool of placeable pieces.
- [x] Filters on puzzle selection screen e.g. never completed, type based ... etc

## UI polish

- [x] Add a soft shadow when a piece lifts, a quick settle when it snaps, and a brief highlight along the seam after placement. Keep the piece anchored to the pointer or finger during the drag.
- [x] Refine the board, tray, and guide colours across themes. Use consistent spacing and reserve the strongest accent for primary actions and selected states.
- [x] Give picker previews more room and align card titles and metadata consistently. Show progress such as “34 of 80 placed” for saved attempts, “Completed” for solved puzzles without an active attempt, and leave the status blank for untouched puzzles.
- [x] Add a subtle pressed state to buttons and picker cards for mouse and touch. Clear the card’s pressed state when the player starts scrolling.
- [x] Show a “Fit board” control after the player pans or zooms so they can return to the full puzzle in one tap.
- [x] On completion, fade the guide and any visible seams, tuck away the empty tray, and let the finished scene keep moving briefly before showing the next action.

## Play screen performance

- [x] **High:** Skip rendering tray pieces fully outside the tray viewport. Camera clipping alone still runs each piece's WebGL mask filter, even with up to 128 pieces in the tray. Keep partially visible and lifted pieces visible.
- [ ] **Medium:** Skip live texture captures when the source has not changed, such as during parallax pauses. If Hex Coast remains costly, cache static scenery without changing draw order.
- [x] **Medium:** Compute tray slot positions directly instead of destroying and recreating slot zones after a placement or when the tray crosses a row or column threshold.
- [ ] **Medium:** Update only dirty regions of the board mask if full-canvas rasterization and upload cause drop latency. Preserve seamless joins between adjacent pieces.
- [ ] **Low:** Keep unrelated completion history off the synchronous progress-save path without delaying durable saves of placements.
- [ ] **Low:** Cache inline header measurements so stacked labels do not resize and rerasterize twice after each placement.
