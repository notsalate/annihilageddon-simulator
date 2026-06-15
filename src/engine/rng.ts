export interface RandomSource {
  next(): number;
  nextInt(maxExclusive: number): number;
}

export function createSeededRng(seed: number): RandomSource {
  return new Mulberry32(seed >>> 0);
}

class Mulberry32 implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer");
    }

    return Math.floor(this.next() * maxExclusive);
  }
}
