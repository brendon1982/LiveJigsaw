export function hasTouchTargets(): boolean {
  return window.matchMedia('(any-pointer: coarse)').matches;
}
