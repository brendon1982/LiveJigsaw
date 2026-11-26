import { isQuarterTurns, type Point } from './geometry.ts';
import type { Puzzle } from './Puzzle.ts';

export type ParkedGroup = Readonly<{
  memberIds: readonly string[];
  anchorPieceId: string;
  position: Point;
  quarterTurns: number;
}>;

export class PieceWorkspace {
  private readonly puzzle: Puzzle;
  private groups: readonly ParkedGroup[] = [];
  private groupsByMember = new Map<string, ParkedGroup>();

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
  }

  get parkedGroups(): readonly ParkedGroup[] {
    return this.groups.slice();
  }

  groupOf(pieceId: string): ParkedGroup | undefined {
    return this.groupsByMember.get(pieceId);
  }

  positionOf(group: ParkedGroup, pieceId: string): Point {
    const offset = this.rotatedOffset(group.anchorPieceId, pieceId, group.quarterTurns);
    return { x: group.position.x + offset.x, y: group.position.y + offset.y };
  }

  settleDrop(group: ParkedGroup, { lifted, parkOnMiss }: { lifted?: ParkedGroup; parkOnMiss: boolean }) {
    const match = this.closestJoin(group, lifted);
    if (!match && !parkOnMiss) return;
    const settled = match ? {
      ...group,
      memberIds: [...match.resting.memberIds, ...group.memberIds],
      anchorPieceId: match.resting.anchorPieceId,
      position: match.resting.position,
    } : group;
    const remaining = this.groups.filter((entry) => entry !== lifted && entry !== match?.resting);
    this.replaceGroups([...remaining, freezeGroup(settled)]);
    return match ? 'joined' : 'parked';
  }

  remove(group: ParkedGroup): void {
    this.replaceGroups(this.groups.filter((entry) => entry !== group));
  }

  turn(group: ParkedGroup, pieceId: string): void {
    const turned = {
      ...this.reanchor(group, group.memberIds, pieceId),
      quarterTurns: (group.quarterTurns + 1) % 4,
    };
    const remaining = this.groups.filter((entry) => entry !== group);
    this.replaceGroups([...remaining, freezeGroup(turned)]);
  }

  breakOff(group: ParkedGroup, pieceId: string): boolean {
    if (group.memberIds.length < 2) return false;
    const remainder = group.memberIds.filter((id) => id !== pieceId);
    const parts = this.connectedComponents(remainder).map((ids) => this.reanchor(group, ids, ids[0]));
    const detached = {
      memberIds: [pieceId], anchorPieceId: pieceId, quarterTurns: group.quarterTurns,
      position: this.separatedPosition(group, pieceId),
    };
    this.replaceGroup(group, [...parts, detached]);
    return true;
  }

  readSnapshot(entries: readonly unknown[]): readonly ParkedGroup[] | undefined {
    if (!Array.isArray(entries)) return;
    const groups: ParkedGroup[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      const group = this.readGroup(entry, seen);
      if (!group) return;
      groups.push(freezeGroup(group));
    }
    return groups;
  }

  replaceGroups(groups: readonly ParkedGroup[]): void {
    this.groups = groups;
    this.groupsByMember = new Map(groups.flatMap((group) => group.memberIds.map((id) => [id, group])));
  }

  private readGroup(entry: unknown, seen: Set<string>): ParkedGroup | undefined {
    if (!entry || typeof entry !== 'object') return;
    const { memberIds, anchorPieceId, position, quarterTurns } = entry as Partial<ParkedGroup>;
    if (!Array.isArray(memberIds) || memberIds.length === 0
      || typeof anchorPieceId !== 'string' || !memberIds.includes(anchorPieceId)
      || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)
      || !isQuarterTurns(quarterTurns) || (!this.puzzle.pieceRotation && quarterTurns !== 0)) return;

    for (const id of memberIds) {
      if (typeof id !== 'string' || seen.has(id) || !this.puzzle.pieceById(id)) return;
      seen.add(id);
    }
    if (this.connectedComponents(memberIds).length !== 1) return;
    return { memberIds, anchorPieceId, position, quarterTurns };
  }

  private replaceGroup(group: ParkedGroup, parts: readonly ParkedGroup[]): void {
    const replacements = parts.map(freezeGroup);
    this.replaceGroups(this.groups.flatMap((entry) => entry === group ? replacements : [entry]));
  }

  private reanchor(group: ParkedGroup, memberIds: readonly string[], anchorPieceId: string): ParkedGroup {
    return { ...group, memberIds, anchorPieceId, position: this.positionOf(group, anchorPieceId) };
  }

  private separatedPosition(group: ParkedGroup, pieceId: string): Point {
    const neighbors = this.puzzle.neighborIds(pieceId)
      .filter((id) => this.groupOf(id) === group)
      .map((id) => this.rotatedOffset(pieceId, id, group.quarterTurns))
      .map(({ x, y }) => ({ x: Math.sign(x), y: Math.sign(y) }));
    const directions = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    let away = directions[0];
    let bestClearance = -1;
    for (const direction of directions) {
      const clearance = Math.min(...neighbors.map(({ x, y }) => Math.hypot(x - direction.x, y - direction.y)));
      if (clearance > bestClearance) {
        away = direction;
        bestClearance = clearance;
      }
    }

    const { x, y } = this.positionOf(group, pieceId);
    const distance = (this.puzzle.snapTolerance + 6) / 2;
    return { x: x + away.x * distance, y: y + away.y * distance };
  }

  private closestJoin(group: ParkedGroup, lifted?: ParkedGroup) {
    let closest: { resting: ParkedGroup; distance: number } | undefined;
    for (const id of group.memberIds) {
      const center = this.positionOf(group, id);
      const start = lifted && this.positionOf(lifted, id);
      for (const neighborId of this.puzzle.neighborIds(id)) {
        const resting = this.groupOf(neighborId);
        if (!resting || resting === lifted || resting.quarterTurns !== group.quarterTurns) continue;

        const expected = this.positionOf(resting, id);
        const distance = Math.hypot(center.x - expected.x, center.y - expected.y);
        if (distance > this.puzzle.snapTolerance) continue;
        // A detached piece can start within snap range. Let it move away without sticking.
        if (start && distance > 0 && distance >= Math.hypot(start.x - expected.x, start.y - expected.y)) continue;
        // Ties keep the first match in member order, then top/right/bottom/left order.
        if (!closest || distance < closest.distance) {
          closest = { resting, distance };
        }
      }
    }
    return closest;
  }

  private rotatedOffset(from: string, to: string, quarterTurns: number): Point {
    const origin = this.puzzle.pieceById(from)!.target;
    const target = this.puzzle.pieceById(to)!.target;
    const x = target.x - origin.x;
    const y = target.y - origin.y;
    switch (quarterTurns) {
      case 1: return { x: -y, y: x };
      case 2: return { x: -x, y: -y };
      case 3: return { x: y, y: -x };
      default: return { x, y };
    }
  }

  private connectedComponents(memberIds: readonly string[]): string[][] {
    const remaining = new Set(memberIds);
    const components: string[][] = [];
    for (const id of remaining) {
      remaining.delete(id);
      const component = [id];
      for (const memberId of component) {
        for (const neighborId of this.puzzle.neighborIds(memberId)) {
          if (remaining.delete(neighborId)) component.push(neighborId);
        }
      }
      components.push(component);
    }
    return components;
  }
}

function freezeGroup(group: ParkedGroup): ParkedGroup {
  const { memberIds, position } = group;
  return Object.freeze({
    ...group,
    memberIds: Object.freeze([...memberIds]),
    position: Object.freeze({ x: position.x, y: position.y }),
  });
}