# Live Jigsaw TODO

- [x] Save puzzle progress so players can leave a partially completed puzzle and resume it later.
- [ ] Add unlockable effects that play when a piece is placed. Decide how players unlock them.
- [ ] Add more puzzle piece shapes.
- [x] Vary the shape of piece connectors and where they sit along each edge.
- [x] Add UI themes.
- [ ] Add a loading screen.
- [x] Add colour filters for the image drawn on the board, such as black and white or sepia.
- [x] Add an animation speed setting with **Slow**, **Normal**, and **Fast** as part of the puzzle source contract. Each puzzle source must define how those speeds affect its animation.
- [ ] Challenge modes e.g. pieces must be placed in a particular sequence, limited pool of placeable pieces.
- [ ] Filters on puzzle selection screen e.g. never completed, type based ... etc

## UI polish

- [x] Add a soft shadow when a piece lifts, a quick settle when it snaps, and a brief highlight along the seam after placement. Keep the piece anchored to the pointer or finger during the drag.
- [ ] Refine the board, tray, and guide colours across themes. Use consistent spacing and reserve the strongest accent for primary actions and selected states.
- [ ] Give picker previews more room and align card titles and metadata consistently. Show progress such as “Resume · 34 of 80” for saved attempts, “Completed” for solved puzzles without an active attempt, and leave the status blank for untouched puzzles.
- [ ] Add a subtle pressed state to buttons and picker cards for mouse and touch. Clear the card’s pressed state when the player starts scrolling.
- [ ] Show a “Fit board” control after the player pans or zooms so they can return to the full puzzle in one tap.
- [ ] On completion, fade the guide and any visible seams, tuck away the empty tray, and let the finished scene keep moving briefly before showing the next action.
