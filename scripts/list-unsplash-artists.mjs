import { readFileSync } from 'node:fs';

const puzzleCatalog = new URL('../src/puzzles/catalog.ts', import.meta.url);
const landingCatalog = new URL('../src/landingArtwork/catalog.ts', import.meta.url);
const unsplash = 'https://unsplash.com';

function puzzleArtistPaths() {
  const catalog = readFileSync(puzzleCatalog, 'utf8');
  const sourceModules = catalog.matchAll(/^import\s+\{[^}]+\}\s+from\s+['"](\.\/[^'"]+Source)['"]/gm);
  const artistPaths = [];

  for (const [, modulePath] of sourceModules) {
    const source = readFileSync(new URL(`${modulePath}.ts`, puzzleCatalog), 'utf8');
    for (const [, artistPath] of source.matchAll(/\bartistUrl:\s*['"]https:\/\/unsplash\.com\/(@[^'"]+)['"]/g)) {
      artistPaths.push(artistPath);
    }
  }

  return artistPaths;
}

function landingArtistPaths() {
  const catalog = readFileSync(landingCatalog, 'utf8');
  return Array.from(catalog.matchAll(/['"](@[\w-]+(?:\/[^'"]*)?)['"]/g), ([, artistPath]) => artistPath);
}

const artistPaths = [...puzzleArtistPaths(), ...landingArtistPaths()];
const profiles = new Set(artistPaths.map((path) => `${unsplash}/${path.split(/[/?#]/, 1)[0]}`));

for (const profile of [...profiles].sort()) {
  console.log(profile);
}