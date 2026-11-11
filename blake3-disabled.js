throw new Error('Optional BLAKE3 acceleration is disabled; the engine uses its built-in change detector.');

export function hash() {
  throw new Error('Optional BLAKE3 acceleration is disabled.');
}
