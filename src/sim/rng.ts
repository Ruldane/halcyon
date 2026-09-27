/**
 * Seedable randomness. The city's stream (`Rng`) advances with the simulation
 * and is saved with it; `hash`-derived draws are pure functions of their keys,
 * so the almanac (storms, fires) is the same for a given city and day whether
 * it is lived through or caught up after an absence.
 */

export function hash32(...keys: number[]): number {
  let h = 0x811c9dc5 ^ keys.length;
  for (const k of keys) {
    let x = Math.floor(k) | 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x ^= x >>> 16;
    h = Math.imul(h ^ x, 0x01000193);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A uniform number in [0, 1) from keys. */
export function hashUnit(...keys: number[]): number {
  return hash32(...keys) / 4294967296;
}

export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** sfc32: small, fast, and its whole state is four integers we can save. */
export class Rng {
  a: number;
  b: number;
  c: number;
  d: number;

  constructor(seed: number | [number, number, number, number]) {
    if (Array.isArray(seed)) {
      [this.a, this.b, this.c, this.d] = seed;
    } else {
      this.a = hash32(seed, 1);
      this.b = hash32(seed, 2);
      this.c = hash32(seed, 3);
      this.d = 1;
      for (let i = 0; i < 16; i++) this.next();
    }
  }

  state(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  nextU32(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    const t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const r = (t + this.d) | 0;
    this.c = (this.c + r) | 0;
    return r >>> 0;
  }

  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(lo: number, hiInclusive: number): number {
    return lo + Math.floor(this.next() * (hiInclusive - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick; returns -1 when every weight is zero. */
  weighted(weights: ArrayLike<number>): number {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Math.max(0, weights[i]);
    if (sum <= 0) return -1;
    let r = this.next() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Poisson draw, for the absence model. */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.gauss()));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  gauss(): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
