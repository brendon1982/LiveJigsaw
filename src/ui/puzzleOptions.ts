import { connectorStyles, type ConnectorStyleId } from '../domain/connectorStyles';
import { availablePuzzleSizes, type PuzzleSize } from '../domain/puzzleSizes';
import type { PuzzleSource } from '../puzzles/PuzzleSource';

export function showPuzzleOptions(
  source: PuzzleSource,
  play: (size: PuzzleSize, connectorStyle: ConnectorStyleId) => void,
): HTMLDialogElement {
  const sizes = availablePuzzleSizes(source.maxViewport);
  const styles = Object.keys(connectorStyles) as ConnectorStyleId[];
  const dialog = document.createElement('dialog');
  dialog.className = 'puzzle-options';
  dialog.setAttribute('aria-labelledby', 'puzzle-options-title');
  dialog.innerHTML = `
    <form>
      <h2 id="puzzle-options-title"></h2>
      <label>Puzzle size <select name="size" autofocus></select></label>
      <label>Connector style <select name="connectorStyle"></select></label>
      <div class="puzzle-options-actions">
        <button type="button">Cancel</button>
        <button type="submit">Play</button>
      </div>
    </form>
  `;
  dialog.querySelector('h2')!.textContent = source.title;
  const sizeSelect = dialog.querySelector<HTMLSelectElement>('select[name="size"]')!;
  const styleSelect = dialog.querySelector<HTMLSelectElement>('select[name="connectorStyle"]')!;
  for (const size of sizes) sizeSelect.add(new Option(`${size.label} · ${size.columns * size.rows}`));
  for (const style of styles) styleSelect.add(new Option(connectorStyles[style].label, style));

  dialog.querySelector<HTMLButtonElement>('button[type="button"]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('form')!.addEventListener('submit', (event) => {
    event.preventDefault();
    const size = sizes[sizeSelect.selectedIndex];
    const style = styles[styleSelect.selectedIndex];
    if (!size || !style) return;
    dialog.close();
    play(size, style);
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
