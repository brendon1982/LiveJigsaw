export const puzzleThemes = [
  'Alien Worlds', 'Candy', 'Coast', 'Countryside', 'Desert', 'Halloween',
  'Medieval', 'Mountains', 'Ocean', 'Sky', 'Space', 'Woodland',
] as const;
export const puzzleTypes = ['Animated', 'Parallax', 'Procedural'] as const;

export type PuzzleTheme = typeof puzzleThemes[number];
export type PuzzleType = typeof puzzleTypes[number];
export type PuzzleTags = Readonly<{ theme: PuzzleTheme; type: PuzzleType }>;
