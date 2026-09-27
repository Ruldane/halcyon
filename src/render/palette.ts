/**
 * The palette of the night shift. Night teal for the ground of everything,
 * ivory for Bakelite and paper, lamp light for light itself, jade for cloth
 * and connection, nickel for metal, and coral for one thing only: the
 * visitor's presence (the listening cord, a traced rumour, suspicion).
 */

export const INK = {
  night0: "#051417",
  night1: "#0a2226",
  night2: "#0f2e33",
  night3: "#15393e",
  night4: "#1f4a4f",
  ivory: "#ece4cf",
  ivoryDim: "#b9b09b",
  lamp: "#ffd88f",
  lampHot: "#fff1c9",
  lampDeep: "#e9a94e",
  jade: "#5fae96",
  jadeDeep: "#2f6f60",
  nickel: "#a9b5b2",
  nickelDim: "#6f7e7c",
  coral: "#ff7b67",
  ember: "#ffae5c",
};

/** Mix two hex colours; t in 0..1. */
export function mix(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export function rgba(hex: string, a: number): string {
  const p = parse(hex);
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
}

const cache = new Map<string, [number, number, number]>();
function parse(c: string): [number, number, number] {
  const hit = cache.get(c);
  if (hit) return hit;
  let v: [number, number, number];
  if (c.startsWith("#")) {
    const n = parseInt(c.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c);
    v = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  }
  cache.set(c, v);
  return v;
}

/** Facade tones by time of day: 0 night, 1 day. */
export function tones(day: number) {
  return {
    far: mix("#0c2529", "#7d9a97", day),
    farHaze: mix("#123439", "#aebfb5", day),
    facade: mix("#0f2a2e", "#5f7f7e", day),
    facadeLit: mix("#18393e", "#7b9795", day),
    edge: mix("#2b5a5e", "#b8c8c0", day),
    shadow: mix("#081b1e", "#48625f", day),
    glass: mix("#061619", "#35524f", day),
    ground: mix("#07181b", "#3c5452", day),
    street: mix("#0a1f22", "#4c6461", day),
    water: mix("#061a1f", "#4f7275", day),
    steel: mix("#1b3438", "#51615f", day),
    roof: mix("#0c2427", "#566f6d", day),
  };
}
