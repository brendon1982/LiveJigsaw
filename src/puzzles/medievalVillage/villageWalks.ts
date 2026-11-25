export type VillagePoint = { x: number; y: number };

export type Villager = {
  front: number;
  back: number;
  phase: number;
  speed: number;
  lane: number;
  stops: number[];
};

type WalkStep = {
  from: VillagePoint;
  to: VillagePoint;
  heading: VillagePoint;
  start: number;
  duration: number;
  moving: boolean;
};

export function planWalk(
  villager: Villager,
  route: (from: number, to: number) => VillagePoint[],
  pause: () => number,
) {
  const steps: WalkStep[] = [];
  let duration = 0;
  villager.stops.forEach((stop, index) => {
    const next = villager.stops[(index + 1) % villager.stops.length];
    const path = walkingLane(route(stop, next), villager.lane);
    for (let i = 1; i < path.length; i += 1) {
      const from = path[i - 1];
      const to = path[i];
      const heading = { x: to.x - from.x, y: to.y - from.y };
      const travel = Math.hypot(heading.x, heading.y) / villager.speed;
      steps.push({ from, to, heading, start: duration, duration: travel, moving: true });
      duration += travel;
    }
    const arrival = steps[steps.length - 1];
    const rest = pause();
    steps.push({ from: arrival.to, to: arrival.to, heading: arrival.heading, start: duration, duration: rest, moving: false });
    duration += rest;
  });
  return { ...villager, steps, duration };
}

function walkingLane(path: VillagePoint[], lane: number): VillagePoint[] {
  const result = [path[0]];
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const forwardX = dx / length;
    const forwardY = dy / length;
    const inset = 4;
    // Offset to the right of travel and leave room to turn at each end.
    const sideX = forwardY * lane;
    const sideY = forwardX * lane;
    result.push(
      { x: from.x + forwardX * inset - sideX, y: from.y + forwardY * inset + sideY },
      { x: to.x - forwardX * inset - sideX, y: to.y - forwardY * inset + sideY },
    );
  }
  result.push(path[path.length - 1]);
  return result;
}

export function walkPose(walk: ReturnType<typeof planWalk>, elapsed: number) {
  const time = (elapsed + walk.phase * walk.duration) % walk.duration;
  const step = walk.steps.find(({ start, duration }) => time < start + duration) ?? walk.steps[0];
  const progress = (time - step.start) / step.duration;
  const x = step.from.x + (step.to.x - step.from.x) * progress;
  const y = step.from.y + (step.to.y - step.from.y) * progress;
  const { x: dx, y: dy } = step.heading;
  return {
    x,
    y,
    bob: step.moving ? 0.8 * Math.abs(Math.sin(time * walk.speed * 0.7)) : 0,
    frame: dy < -Math.abs(dx) ? walk.back : walk.front,
    flip: dx < -Math.abs(dy),
  };
}
