/**
 * Rumours travel along real conversations. Each telling makes a new version
 * (parent, teller, hearer, time, call, wording), so the path of any rumour
 * can be traced person by person, with its words changing as it goes.
 */
import { claimText } from "../grammar/rumour";
import { tieOf } from "./city";
import { DAY } from "./clock";
import type { Rng } from "./rng";
import { K, type Citizen, type Claim, type Rumour, type RumourTpl, type Version, type World } from "./types";

/** Templates whose claims name a second person who may be swapped in retelling. */
const HAS_OTHER: RumourTpl[] = ["crush", "car", "letters", "seen", "surprise"];
const HAS_AMOUNT: RumourTpl[] = ["debt", "inheritance"];
/** Truthful by nature: news of things that happened. */
const NEWS: RumourTpl[] = ["engaged", "broken", "fire", "storm", "bankrupt", "opening", "wedding", "birth", "lostjob", "rehired", "answered"];

export const isNews = (tpl: RumourTpl) => NEWS.includes(tpl);

/** Rumours are kept in id order, so a lookup is a binary search. */
export function rumourById(w: World, id: number): Rumour | undefined {
  const a = w.rumours;
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = a[mid].id;
    if (v === id) return a[mid];
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** How much a rumour is worth passing on. */
export function juice(r: Rumour, population = 300): number {
  const base = r.tpl === "listener" ? 0.9 : isNews(r.tpl) ? 0.75 : r.tpl === "seen" || r.tpl === "crush" ? 0.95 : 0.7;
  // Old news is no news: a rumour everyone knows is not worth the breath.
  const common = Math.min(1, r.knowers / (population * 0.6));
  return base * r.heat * (1 - common) * (1 - common);
}

export function createRumour(
  w: World,
  tpl: RumourTpl,
  claim: Claim,
  origin: number,
  hearer: number,
  t: number,
  call: number,
  opts: { truth?: boolean; event?: number; hedge?: number } = {},
): Rumour {
  const id = w.nextRumourId++;
  const r: Rumour = {
    id,
    tpl,
    subject: claim.subj,
    truth: opts.truth ?? true,
    origin,
    born: t,
    versions: [],
    heat: 0.7,
    knowers: 0,
    peak: 0,
    lastTold: t,
    dead: false,
    event: opts.event ?? -1,
  };
  w.rumours.push(r);
  const root: Version = { id: 0, parent: -1, teller: origin, hearer: origin, t, claim: { ...claim }, text: claimText(w, claim, 0), call: -1, hedge: 0 };
  r.versions.push(root);
  know(w, w.citizens[origin], r, 0);
  if (hearer >= 0 && hearer !== origin) {
    const hedge = opts.hedge ?? 3;
    const v: Version = { id: 1, parent: 0, teller: origin, hearer, t, claim: { ...claim }, text: claimText(w, claim, hedge), call, hedge };
    r.versions.push(v);
    know(w, w.citizens[hearer], r, 1);
  }
  return r;
}

function know(w: World, c: Citizen | undefined, r: Rumour, v: number) {
  if (!c) return;
  if (c.knows[r.id] === undefined) {
    r.knowers++;
    r.peak = Math.max(r.peak, r.knowers);
  }
  c.knows[r.id] = v;
}

export function knows(c: Citizen, r: Rumour): boolean {
  return c.knows[r.id] !== undefined;
}

/** Mutate a claim as a teller would, retelling it. */
export function mutate(rng: Rng, w: World, teller: Citizen, claim: Claim, tpl: RumourTpl): Claim {
  const c = { ...claim };
  const loose = 0.18 + 0.4 * teller.traits.gossip - 0.22 * teller.traits.discretion;
  if (tpl === "listener") {
    // The talk of listening grows in the telling, until it settles.
    if (rng.chance(0.3 + loose * 0.5) && c.x < 3) c.x++;
    return c;
  }
  if (!rng.chance(Math.max(0.05, loose))) return c;
  const ops: number[] = [3, HAS_AMOUNT.includes(tpl) ? 1.2 : 0, HAS_OTHER.includes(tpl) && c.other >= 0 ? 0.7 : 0, c.x > 0 ? 0.5 * teller.traits.discretion : 0];
  const op = rng.weighted(ops);
  if (op === 0 && c.x < 3) c.x++;
  else if (op === 1) c.n = Math.min(12, Math.round(c.n * 1.6 + 1));
  else if (op === 2) {
    const o = w.citizens[c.other];
    const cands = o ? o.ties.filter((t) => t.k & (K.KIN | K.FRIEND | K.COLLEAGUE) && t.o !== c.subj && w.citizens[t.o].sex === o.sex) : [];
    if (cands.length) c.other = rng.pick(cands).o;
    else if (c.x < 3) c.x++;
  } else if (op === 3) c.x--;
  return c;
}

/**
 * The teller passes what they know to the hearer. Returns the new version, or
 * null if the hearer already knew (in which case the talk warms it anyway).
 */
export function tell(rng: Rng, w: World, r: Rumour, teller: Citizen, hearer: Citizen, t: number, call: number): Version | null {
  const vi = teller.knows[r.id];
  if (vi === undefined) return null;
  const from = r.versions[vi];
  r.lastTold = t;
  if (hearer.knows[r.id] !== undefined) {
    // Already heard. A juicier telling replaces the duller one they had.
    const theirs = r.versions[hearer.knows[r.id]];
    if (from.claim.x > theirs.claim.x && rng.chance(0.4)) hearer.knows[r.id] = vi;
    return null;
  }
  const claim = mutate(rng, w, teller, from.claim, r.tpl);
  let hedge = from.hedge;
  if (rng.chance(0.45)) hedge = Math.max(0, hedge - 1);
  if (teller.traits.discretion > 0.7 && rng.chance(0.5)) hedge = Math.max(hedge, 1);
  if (teller.suspicion > 0.4 && rng.chance(0.5)) hedge = Math.max(hedge, 3);
  const v: Version = {
    id: r.versions.length,
    parent: vi,
    teller: teller.id,
    hearer: hearer.id,
    t,
    claim,
    text: claimText(w, claim, hedge),
    call,
    hedge,
  };
  r.versions.push(v);
  know(w, hearer, r, v.id);
  if (r.tpl !== "listener") r.heat = Math.min(1, r.heat + 0.025 * (1 - r.knowers / w.citizens.length));
  return v;
}

/** Which rumour a citizen would pass to this hearer now, if any. */
export function choosePassable(rng: Rng, w: World, teller: Citizen, hearer: Citizen, guarded: boolean): Rumour | null {
  let best: Rumour | null = null;
  let bestScore = 0;
  const tie = tieOf(teller, hearer.id);
  const trust = tie ? tie.tr : 0.2;
  for (const key in teller.knows) {
    const r = rumourById(w, Number(key));
    if (!r || r.dead) continue;
    if (r.subject === hearer.id && r.tpl !== "listener" && !isNews(r.tpl)) continue; // not to their face
    if (r.subject === teller.id && !isNews(r.tpl) && r.tpl !== "listener") continue; // one's own secret goes by confiding
    let score = juice(r, w.citizens.length) * (0.3 + teller.traits.gossip) * (0.4 + trust);
    if (hearer.knows[r.id] !== undefined) score *= 0.25;
    // Kind to the subject's close ones: less likely to tell a sister about her sister.
    const st = r.subject >= 0 ? tieOf(hearer, r.subject) : undefined;
    if (st && st.k & (K.KIN | K.SPOUSE | K.ROMANCE) && !isNews(r.tpl)) score *= 0.35;
    if (guarded && r.tpl !== "listener" && !isNews(r.tpl)) score *= 0.1;
    if (r.tpl === "listener" && guarded) score *= 1.6;
    score *= rng.range(0.6, 1.4);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore > 0.34 ? best : null;
}

/** Heat fades; a rumour no one repeats is forgotten. */
export function decayRumours(w: World, t: number, dtMs: number): Rumour[] {
  const died: Rumour[] = [];
  const days = dtMs / DAY;
  for (const r of w.rumours) {
    if (r.dead) continue;
    const half = r.tpl === "listener" ? 1.1 : isNews(r.tpl) ? 0.8 : 1.0;
    r.heat *= Math.pow(0.5, days / half);
    if (r.heat < 0.035 && t - r.lastTold > DAY * 0.5) {
      r.dead = true;
      died.push(r);
    }
  }
  return died;
}

/** Keep the archive bounded: forget long-dead rumours no visitor traced. */
export function pruneRumours(w: World, keep: Set<number>, t: number): void {
  const old = t - 14 * DAY;
  const drop = new Set<number>();
  for (const r of w.rumours) if (r.dead && r.lastTold < old && !keep.has(r.id)) drop.add(r.id);
  if (!drop.size) return;
  w.rumours = w.rumours.filter((r) => !drop.has(r.id));
  for (const c of w.citizens) for (const k in c.knows) if (drop.has(Number(k))) delete c.knows[k];
}

export function versionTruth(r: Rumour, v: Version): "true" | "embroidered" | "untrue" {
  const o = r.versions[0].claim;
  if (!r.truth) return "untrue";
  if (v.claim.other !== o.other && o.other >= 0) return "untrue";
  const dx = v.claim.x - o.x;
  if (dx <= 0 && Math.abs(v.claim.n - o.n) < 1) return "true";
  if (dx <= 1) return "embroidered";
  return "untrue";
}
