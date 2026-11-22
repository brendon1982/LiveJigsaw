import { drawLighthouse, LighthouseScene } from './LighthouseScene';
import { drawWindmill, WindmillScene } from './WindmillScene';

export const puzzles = [
  { sourceKey: WindmillScene.key, title: 'Windmill', drawArtwork: drawWindmill },
  { sourceKey: LighthouseScene.key, title: 'Lighthouse', drawArtwork: drawLighthouse },
] as const;

export type Puzzle = typeof puzzles[number];
