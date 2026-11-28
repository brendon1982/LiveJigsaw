export const puzzleThemes = [
  'Alien Worlds', 'Candy', 'Coast', 'Countryside', 'Desert', 'Flowers',
  'Halloween', 'Medieval', 'Mountains', 'Ocean', 'Sky', 'Space', 'Wildlife', 'Woodland', 'City',
  'Food', 'Christmas', 'Pets', 'Dragons',
] as const;
export const puzzleTypes = ['Flat Illustration', 'Parallax', 'Procedural'] as const;

export type PuzzleTheme = typeof puzzleThemes[number];
export type PuzzleType = typeof puzzleTypes[number];
export type PuzzleTags = Readonly<{ theme: PuzzleTheme; type: PuzzleType }>;
