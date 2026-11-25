const uint32Range = 0x100000000;

/** Mulberry32. Keep this sequence stable so saved puzzles recreate their cuts. */
export function seededRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed >= uint32Range) {
    throw new RangeError('A puzzle seed must be an unsigned 32-bit integer');
  }

  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const unsignedValue = (value ^ (value >>> 14)) >>> 0;
    return unsignedValue / uint32Range;
  };
}
