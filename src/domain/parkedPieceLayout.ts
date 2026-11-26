import { Bounds, type Point } from './geometry.ts';
import type { ParkedGroup } from './PieceWorkspace.ts';
import type { PuzzlePiece } from './Puzzle.ts';

type TrayPiece = Readonly<{ piece: PuzzlePiece; quarterTurns: number }>;
export type ParkedSingle = Readonly<{ pieceId: string; position: Point; quarterTurns: number }>;

type Layout = Readonly<{ centers: readonly Point[]; footprints: readonly Bounds[] }>;
type GroupLayout = Layout & Readonly<{ group: ParkedGroup }>;

const maxScanIntervals = 64;

export function pieceFootprint(piece: PuzzlePiece, quarterTurns: number): Bounds {
  const { frame } = piece.outline;
  const left = frame.x - piece.target.x;
  const top = frame.y - piece.target.y;
  const right = left + frame.width;
  const bottom = top + frame.height;
  switch (quarterTurns) {
    case 1: return new Bounds(-bottom, left, frame.height, frame.width);
    case 2: return new Bounds(-right, -bottom, frame.width, frame.height);
    case 3: return new Bounds(top, -right, frame.height, frame.width);
    default: return new Bounds(left, top, frame.width, frame.height);
  }
}

export function translateFootprint(footprint: Bounds, center: Point): Bounds {
  return new Bounds(footprint.x + center.x, footprint.y + center.y, footprint.width, footprint.height);
}

export function planTrayParking(
  tray: readonly TrayPiece[], area: Bounds, guide: Bounds, occupied: readonly Bounds[], random: () => number,
): readonly ParkedSingle[] {
  if (!isReachableArea(area)) return [];

  const obstacles = [...occupied];
  return shuffled(tray, random).map(({ piece, quarterTurns }) => {
    const footprint = pieceFootprint(piece, quarterTurns);
    const position = findParkingSlot(footprint, area, guide, obstacles);
    obstacles.push(translateFootprint(footprint, position));
    return { pieceId: piece.id, position, quarterTurns };
  });
}

export function planEdgeSorting(
  edges: readonly GroupLayout[], otherGroups: readonly GroupLayout[], at: Point, area: Bounds,
  placed: readonly Bounds[], random: () => number,
): ReadonlyMap<ParkedGroup, Point> {
  const positions = new Map<ParkedGroup, Point>();
  if (!edges.length || !isReachableArea(area) || ![at.x, at.y].every(Number.isFinite)) return positions;

  const order = shuffled(edges, random);
  const footprints = order.map((edge) => edge.footprints[0]);
  const { layout, gap } = edgeBundle(footprints, area);
  const center = findNearbySlot(layout, at, area, placed);
  const bundle = footprints.map((footprint, index) => {
    const relative = layout.centers[index];
    const position = {
      x: clamp(center.x + relative.x, area.x, area.x + area.width),
      y: clamp(center.y + relative.y, area.y, area.y + area.height),
    };
    positions.set(order[index].group, position);
    return translateFootprint(footprint, position);
  });
  const reserved = padded(enclosingBounds(bundle), gap);

  const occupied = [...placed];
  const blockers: GroupLayout[] = [];
  for (const entry of otherGroups) {
    const parked = entry.footprints.map((footprint) => translateFootprint(footprint, entry.group.position));
    if (parked.some((footprint) => overlapArea(footprint, reserved) > 0)) blockers.push(entry);
    else occupied.push(...parked);
  }
  for (const entry of blockers) {
    const position = findNearbySlot(entry, entry.group.position, area, occupied, reserved);
    positions.set(entry.group, position);
    occupied.push(...entry.footprints.map((footprint) => translateFootprint(footprint, position)));
  }
  return positions;
}

function edgeBundle(footprints: readonly Bounds[], area: Bounds): { layout: Layout; gap: number } {
  const width = Math.max(...footprints.map((footprint) => footprint.width));
  const height = Math.max(...footprints.map((footprint) => footprint.height));
  const gap = Math.min(width, height) / 4;
  const spacing = gap / 4;
  const grid = bundleGrid(footprints.length, width, height, spacing, area);
  const centers = footprints.map((footprint, index) => {
    const row = Math.floor(index / grid.columns);
    const column = index % grid.columns;
    const rowLength = Math.min(grid.columns, footprints.length - row * grid.columns);
    return {
      x: (column - (rowLength - 1) / 2) * grid.pitchX - footprint.center.x,
      y: (row - (grid.rows - 1) / 2) * grid.pitchY - footprint.center.y,
    };
  });
  const frames = footprints.map((footprint, index) => translateFootprint(footprint, centers[index]));
  return { gap, layout: { centers, footprints: frames } };
}

function bundleGrid(count: number, width: number, height: number, spacing: number, area: Bounds) {
  let best = { columns: count, rows: 1, pitchX: 0, pitchY: 0 };
  let bestPitchRatio = -1;
  let bestSize = Infinity;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const pitchX = fittedPitch(columns, width, spacing, area.width);
    const pitchY = fittedPitch(rows, height, spacing, area.height);
    const pitchRatio = Math.min(pitchX / (width + spacing), pitchY / (height + spacing));
    const size = Math.max(width + (columns - 1) * (width + spacing), height + (rows - 1) * (height + spacing));
    if (pitchRatio < bestPitchRatio || (pitchRatio === bestPitchRatio && size >= bestSize)) continue;
    best = { columns, rows, pitchX, pitchY };
    bestPitchRatio = pitchRatio;
    bestSize = size;
  }
  return best;
}

function fittedPitch(count: number, length: number, spacing: number, span: number): number {
  return count === 1 ? length + spacing : clamp((span - length) / (count - 1), 0, length + spacing);
}

function findNearbySlot(layout: Layout, at: Point, area: Bounds, occupied: readonly Bounds[], reserved?: Bounds): Point {
  const envelope = enclosingBounds(layout.footprints);
  const centers = Bounds.around(layout.centers);
  const fitsX = envelope.width <= area.width ? envelope : centers;
  const fitsY = envelope.height <= area.height ? envelope : centers;
  const columns = scanAxis(area.x, area.width, fitsX.x, fitsX.width, reserved?.x ?? at.x, reserved?.width ?? 0, at.x);
  const rows = scanAxis(area.y, area.height, fitsY.y, fitsY.height, reserved?.y ?? at.y, reserved?.height ?? 0, at.y);
  const candidates = rows.flatMap((y) => columns.map((x) => ({ x, y, distance: (x - at.x) ** 2 + (y - at.y) ** 2 })));
  candidates.sort((a, b) => a.distance - b.distance);

  let best = { gapOverlap: Infinity, occupiedOverlap: Infinity, position: { x: columns[0], y: rows[0] } };
  for (const { x, y } of candidates) {
    const position = { x, y };
    const bounds = translateFootprint(envelope, position);
    const frames = layout.footprints.map((footprint) => translateFootprint(footprint, position));
    const gapOverlap = reserved && overlapArea(bounds, reserved) > 0 ? totalOverlap(frames, [reserved]) : 0;
    if (gapOverlap > best.gapOverlap) continue;
    const nearby = occupied.filter((obstacle) => overlapArea(bounds, obstacle) > 0);
    const occupiedOverlap = totalOverlap(frames, nearby);
    if (gapOverlap === 0 && occupiedOverlap === 0) return position;
    if (gapOverlap < best.gapOverlap || occupiedOverlap < best.occupiedOverlap) {
      best = { gapOverlap, occupiedOverlap, position };
    }
  }
  return best.position;
}

function totalOverlap(frames: readonly Bounds[], obstacles: readonly Bounds[]): number {
  let overlap = 0;
  for (const obstacle of obstacles) {
    for (const frame of frames) overlap += overlapArea(frame, obstacle);
  }
  return overlap;
}

function overlapArea(a: Bounds, b: Bounds): number {
  return overlapLength(a.x, a.width, b.x, b.width) * overlapLength(a.y, a.height, b.y, b.height);
}

function enclosingBounds(footprints: readonly Bounds[]): Bounds {
  return Bounds.around(footprints.flatMap(({ x, y, width, height }) => [{ x, y }, { x: x + width, y: y + height }]));
}

function padded(bounds: Bounds, gap: number): Bounds {
  return new Bounds(bounds.x - gap, bounds.y - gap, bounds.width + gap * 2, bounds.height + gap * 2);
}

function isReachableArea(area: Bounds): boolean {
  return area.width >= 0 && area.height >= 0
    && [area.x, area.y, area.x + area.width, area.y + area.height].every(Number.isFinite);
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const order = [...items];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}

function findParkingSlot(footprint: Bounds, area: Bounds, guide: Bounds, obstacles: readonly Bounds[]): Point {
  const columns = scanAxis(area.x, area.width, footprint.x, footprint.width, guide.x, guide.width);
  const rows = scanAxis(area.y, area.height, footprint.y, footprint.height, guide.y, guide.height);
  const guideCenter = guide.center;
  let bestPosition = { x: columns[0], y: rows[0] };
  let bestOverlap = Infinity;
  let bestGuideOverlap = Infinity;
  let bestDistance = Infinity;

  for (const y of rows) {
    const top = y + footprint.y;
    const bottom = top + footprint.height;
    const rowObstacles = obstacles.filter((obstacle) => top < obstacle.y + obstacle.height && bottom > obstacle.y);
    const guideHeight = overlapLength(top, footprint.height, guide.y, guide.height);

    for (const x of columns) {
      const left = x + footprint.x;
      const guideOverlap = guideHeight * overlapLength(left, footprint.width, guide.x, guide.width);
      const distance = (x - guideCenter.x) ** 2 + (y - guideCenter.y) ** 2;
      const preferred = guideOverlap < bestGuideOverlap || (guideOverlap === bestGuideOverlap && distance < bestDistance);
      if (bestOverlap === 0 && !preferred) continue;

      let overlap = 0;
      for (const obstacle of rowObstacles) {
        const width = overlapLength(left, footprint.width, obstacle.x, obstacle.width);
        if (width > 0) overlap += width * overlapLength(top, footprint.height, obstacle.y, obstacle.height);
        if (overlap > bestOverlap || (overlap === bestOverlap && !preferred)) break;
      }
      if (overlap < bestOverlap || (overlap === bestOverlap && preferred)) {
        bestPosition = { x, y };
        bestOverlap = overlap;
        bestGuideOverlap = guideOverlap;
        bestDistance = distance;
      }
    }
  }
  return bestPosition;
}

function scanAxis(
  start: number, span: number, offset: number, length: number, avoidStart: number, avoidSpan: number, preferred?: number,
): number[] {
  const end = start + span;
  const min = start - offset;
  const max = end - offset - length;
  if (min >= max) return [clamp((min + max) / 2, start, end)];

  const intervals = Math.min(maxScanIntervals, Math.ceil((max - min) / (length / 2)));
  const step = (max - min) / intervals;
  const centers = new Set([min, max]);
  for (let index = 1; index < intervals; index += 1) centers.add(min + index * step);
  // Include flush positions beside the guide or reserved gap even when the scan grid does not line up with it.
  centers.add(clamp(avoidStart - offset - length, min, max));
  centers.add(clamp(avoidStart + avoidSpan - offset, min, max));
  if (preferred !== undefined) centers.add(clamp(preferred, min, max));
  return [...centers];
}

function overlapLength(startA: number, lengthA: number, startB: number, lengthB: number): number {
  return Math.max(0, Math.min(startA + lengthA, startB + lengthB) - Math.max(startA, startB));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}