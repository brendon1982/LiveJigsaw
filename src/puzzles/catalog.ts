import { canyonDriftSource } from './canyonDrift/canyonDriftSource';
import { desertSource } from './desert/desertSource';
import { forestSource } from './forest/forestSource';
import { hexCoastSource } from './hexCoast/hexCoastSource';
import { lighthouseSource } from './lighthouse/lighthouseSource';
import { meadowSource } from './meadow/meadowSource';
import { medievalVillageSource } from './medievalVillage/medievalVillageSource';
import { mountainsSource } from './mountains/mountainsSource';
import { pineHighlandsSource } from './pineHighlands/pineHighlandsSource';
import type { PuzzleSource } from './PuzzleSource';
import { twilightRidgeSource } from './twilightRidge/twilightRidgeSource';
import { windmillSource } from './windmill/windmillSource';

export const puzzleSources: readonly PuzzleSource[] = [
  windmillSource,
  lighthouseSource,
  mountainsSource,
  meadowSource,
  desertSource,
  forestSource,
  medievalVillageSource,
  hexCoastSource,
  canyonDriftSource,
  twilightRidgeSource,
  pineHighlandsSource,
];
