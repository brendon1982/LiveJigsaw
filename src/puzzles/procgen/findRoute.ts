type Neighbor = { id: number; heading: number; cost: number };
type RouteStep = { id: number; heading: number; cost: number; estimate: number; previous?: RouteStep };

export function findRoute(
  start: number,
  target: number,
  neighbors: (id: number) => Neighbor[],
  distance: (id: number, target: number) => number,
  turnCost: number,
): number[] | undefined {
  const frontier: RouteStep[] = [{ id: start, heading: -1, cost: 0, estimate: distance(start, target) }];
  // The cost to leave a tile depends on the direction of arrival.
  const bestCostByArrival = new Map<string, number>();

  while (frontier.length) {
    frontier.sort((a, b) => b.estimate - a.estimate);
    const step = frontier.pop()!;
    if (step.id === target) {
      const path = [];
      for (let current: RouteStep | undefined = step; current; current = current.previous) path.push(current.id);
      return path.reverse();
    }
    for (const { id, heading, cost: travelCost } of neighbors(step.id)) {
      const turns = step.heading !== -1 && step.heading !== heading;
      const cost = step.cost + travelCost + (turns ? turnCost : 0);
      const state = `${id}:${heading}`;
      if (cost >= (bestCostByArrival.get(state) ?? Infinity)) continue;
      bestCostByArrival.set(state, cost);
      const estimate = cost + distance(id, target);
      frontier.push({ id, heading, cost, estimate, previous: step });
    }
  }
}
